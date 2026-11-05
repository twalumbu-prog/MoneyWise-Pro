import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import * as vat from './vat.service';
import { getReceivableAccountId, getDefaultRevenueAccountId } from './customerInvoice.service';

/**
 * Credit notes, in both directions. Enterprise plan; the route enforces that.
 *
 *  Customer credit note  Dr income (before VAT), Dr VAT payable, Cr Accounts Receivable. Applied to an invoice it lowers what the invoice
 *                        still owes; what is left over stays as credit for that customer.
 *  Supplier credit note  Dr Accounts Payable, Cr the chosen expense or inventory account (before VAT), Cr VAT recoverable. Applied to a bill it
 *                        lowers what you still owe on it. It does not change stock: record a stock adjustment for goods you send back.
 * VAT follows the VAT settings: a VAT-registered business's amounts are taken as including VAT. The VAT is entered as a negative amount in
 * the VAT records so the return nets it off.
 */

export class CreditNoteError extends Error { constructor(message: string, readonly httpStatus = 400) { super(message); } }

const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

interface LineIn { description?: string; amount?: number; taxCode?: string; accountId?: string }
type Dir = 'CUSTOMER' | 'SUPPLIER';

async function nextNumber(orgId: string, dir: Dir): Promise<string> {
    const prefix = dir === 'CUSTOMER' ? 'CN' : 'SCN';
    const { data } = await supabase.from('credit_notes').select('note_number').eq('organization_id', orgId).eq('direction', dir).range(0, 9999);
    const max = (data ?? []).reduce((m: number, r: any) => Math.max(m, Number(String(r.note_number).replace(/\D/g, '')) || 0), 0);
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

async function post(orgId: string, userId: string, date: string, memo: string, ref: string, sourceId: string, lines: { account_id: string; debit: number; credit: number; description?: string }[]) {
    const dr = r2(lines.reduce((s, l) => s + l.debit, 0)), cr = r2(lines.reduce((s, l) => s + l.credit, 0));
    if (Math.abs(dr - cr) >= 0.01) throw new CreditNoteError(`The credit note doesn't balance (debits ${dr}, credits ${cr}).`, 500);
    const { data: je, error } = await supabase.from('journal_entries').insert({ organization_id: orgId, entry_date: date, description: memo, reference_number: ref, source_type: 'CREDIT_NOTE', source_id: sourceId, created_by: userId }).select('id').single();
    if (error || !je) throw new CreditNoteError(`Could not post to the ledger: ${error?.message}`, 500);
    const { error: le } = await supabase.from('journal_lines').insert(lines.filter((l) => l.debit || l.credit).map((l) => ({ journal_entry_id: je.id, ...l })));
    if (le) { await supabase.from('journal_entries').delete().eq('id', je.id); throw new CreditNoteError(le.message, 500); }
}

/** Splits each line's amount into net and VAT, according to the business's VAT settings. */
async function priceLines(orgId: string, lines: LineIn[], dir: Dir) {
    if (!Array.isArray(lines) || !lines.length) throw new CreditNoteError('Add at least one line to the credit note.');
    const vs = await vat.getSettings(orgId);
    let net = 0, vatTotal = 0;
    const out = lines.slice(0, 100).map((l, i) => {
        const amount = r2(Number(l.amount));
        if (!(amount > 0)) throw new CreditNoteError(`Line ${i + 1}: enter an amount more than zero.`);
        const description = String(l.description ?? '').trim().slice(0, 200);
        if (!description) throw new CreditNoteError(`Line ${i + 1}: say what is being credited.`);
        const code: vat.TaxCode = vs.registered ? (vat.isTaxCode(l.taxCode) ? l.taxCode : 'STANDARD') : 'STANDARD';
        const s = vs.registered ? vat.split(amount, code, vs.rate, true) : { net: amount, vat: 0, gross: amount };
        net = r2(net + s.net); vatTotal = r2(vatTotal + s.vat);
        return { description, amount, tax_code: vs.registered ? code : null, net: s.net, vat: s.vat, account_id: l.accountId ?? null };
    });
    return { lines: out, net, vat: vatTotal, total: r2(net + vatTotal), registered: vs.registered, dir };
}

// ---------- customers ----------

export async function createCustomerCreditNote(orgId: string, userId: string, body: any) {
    const issueDate = isDate(body?.issueDate) ? body.issueDate : today();
    let invoice: any = null;
    if (body?.invoiceId) {
        const { data } = await supabase.from('customer_invoices').select('*').eq('organization_id', orgId).eq('id', String(body.invoiceId)).maybeSingle();
        if (!data) throw new CreditNoteError('Invoice not found.', 404);
        if (data.status === 'VOID') throw new CreditNoteError('That invoice has been voided.');
        invoice = data;
    }
    let lines: LineIn[] = body?.lines;
    // "Credit the whole invoice" copies its lines, so nothing has to be retyped.
    if (invoice && body?.fullCredit) lines = ((invoice.items ?? []) as any[]).map((it) => ({ description: it.name, amount: Number(it.unit_price) * Number(it.quantity), taxCode: it.tax_code, accountId: it.income_account_id }));
    const priced = await priceLines(orgId, lines, 'CUSTOMER');
    if (invoice && priced.total > Number(invoice.total) + 0.01) throw new CreditNoteError(`This credit (${priced.total.toFixed(2)}) is more than the invoice (${Number(invoice.total).toFixed(2)}).`);
    const customerName = String(invoice?.customer_name ?? body?.customerName ?? '').trim();
    if (!customerName) throw new CreditNoteError('Choose the customer, or an invoice.');

    // Each line credits the income account it was sold under.
    const fallbackIncome = await getDefaultRevenueAccountId(orgId);
    const income = new Map<string, number>();
    const accts = [...new Set(priced.lines.map((l) => l.account_id).filter(Boolean) as string[])];
    const { data: valid } = accts.length ? await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('type', 'INCOME').in('id', accts) : { data: [] as any[] };
    const ok = new Set((valid ?? []).map((a: any) => a.id));
    for (const l of priced.lines) { const a = l.account_id && ok.has(l.account_id) ? l.account_id : fallbackIncome; income.set(a, r2((income.get(a) ?? 0) + l.net)); }

    const number = await nextNumber(orgId, 'CUSTOMER');
    const id = randomUUID();
    const { data: note, error } = await supabase.from('credit_notes').insert({
        id, organization_id: orgId, direction: 'CUSTOMER', note_number: number, customer_id: invoice?.customer_id ?? body?.customerId ?? null, party_name: customerName,
        invoice_id: invoice?.id ?? null, issue_date: issueDate, reason: String(body?.reason ?? '').trim().slice(0, 300) || null, items: priced.lines,
        net: priced.net, vat_amount: priced.vat, total: priced.total, created_by: userId,
    }).select('*').single();
    if (error || !note) throw new CreditNoteError(error?.message ?? 'Could not save the credit note.', 500);

    try {
        const ar = invoice?.receivable_account_id ?? await getReceivableAccountId(orgId);
        await post(orgId, userId, issueDate, `Credit note ${number} — ${customerName}`, number, id, [
            ...[...income].map(([account_id, v]) => ({ account_id, debit: v, credit: 0 })),
            ...(priced.vat > 0 ? [{ account_id: await vat.vatPayableAccount(orgId), debit: priced.vat, credit: 0, description: 'VAT credited' }] : []),
            { account_id: ar, debit: 0, credit: priced.total, description: 'Reduces what the customer owes' },
        ]);
        if (priced.registered) {
            const by = new Map<string, { net: number; vat: number }>();
            for (const l of priced.lines) { const x = by.get(l.tax_code!) ?? { net: 0, vat: 0 }; x.net = r2(x.net + l.net); x.vat = r2(x.vat + l.vat); by.set(l.tax_code!, x); }
            await vat.recordTransactions(orgId, [...by].map(([code, v]) => ({ direction: 'OUTPUT' as const, code: code as vat.TaxCode, date: issueDate, net: -v.net, vat: -v.vat, sourceType: 'CREDIT_NOTE', sourceId: id, counterparty: customerName, reference: number })));
        }
    } catch (e) {
        await vat.removeTransactions(orgId, 'CREDIT_NOTE', id);
        await supabase.from('journal_entries').delete().eq('organization_id', orgId).eq('source_type', 'CREDIT_NOTE').eq('source_id', id);
        await supabase.from('credit_notes').delete().eq('id', id);
        throw e;
    }
    if (invoice) await applyToInvoice(orgId, userId, id, invoice.id).catch(() => undefined); // whatever the invoice still owes is cleared; the rest stays as credit
    const { data: fresh } = await supabase.from('credit_notes').select('*').eq('id', id).single();
    return fresh ?? note;
}

/** Uses up to `amount` of a customer credit note against an invoice's open balance (all it can by default). */
export async function applyToInvoice(orgId: string, userId: string, noteId: string, invoiceId: string, amount?: number) {
    const { data: note } = await supabase.from('credit_notes').select('*').eq('organization_id', orgId).eq('id', noteId).eq('direction', 'CUSTOMER').maybeSingle();
    if (!note) throw new CreditNoteError('Credit note not found.', 404);
    if (note.status === 'VOID') throw new CreditNoteError('That credit note was cancelled.');
    const { data: inv } = await supabase.from('customer_invoices').select('id, status, total, amount_paid, customer_name').eq('organization_id', orgId).eq('id', invoiceId).maybeSingle();
    if (!inv || inv.status === 'VOID') throw new CreditNoteError('Invoice not found, or it has been voided.', 404);
    const left = r2(Number(note.total) - Number(note.amount_applied));
    const owed = r2(Number(inv.total) - Number(inv.amount_paid));
    const use = r2(Math.min(amount != null && amount !== undefined ? Number(amount) : left, left, owed));
    if (!(use > 0)) throw new CreditNoteError(left <= 0 ? 'This credit note has already been used up.' : 'That invoice has nothing left to pay.');
    const { error } = await supabase.from('invoice_payments').insert({ organization_id: orgId, invoice_id: invoiceId, cashbook_entry_id: null, credit_note_id: noteId, amount: use, applied_by: userId });
    if (error) throw new CreditNoteError(error.message, error.code === '23514' ? 409 : 500);
    const applied = r2(Number(note.amount_applied) + use);
    await supabase.from('credit_notes').update({ amount_applied: applied, status: applied >= Number(note.total) - 0.005 ? 'APPLIED' : 'ISSUED', invoice_id: note.invoice_id ?? invoiceId, updated_at: new Date().toISOString() }).eq('id', noteId);
    return { applied: use };
}

// ---------- suppliers ----------

export async function createSupplierCreditNote(orgId: string, userId: string, body: any) {
    const issueDate = isDate(body?.issueDate) ? body.issueDate : today();
    let bill: any = null;
    if (body?.billId) {
        const { data } = await supabase.from('purchase_bills').select('*').eq('organization_id', orgId).eq('id', String(body.billId)).maybeSingle();
        if (!data) throw new CreditNoteError('Bill not found.', 404);
        if (data.status === 'VOID') throw new CreditNoteError('That bill was cancelled.');
        bill = data;
    }
    const supplierId = bill?.supplier_id ?? body?.supplierId;
    const { data: supplier } = await supabase.from('suppliers').select('id, name').eq('organization_id', orgId).eq('id', String(supplierId ?? '')).maybeSingle();
    if (!supplier) throw new CreditNoteError('Choose the supplier, or a bill.');
    const priced = await priceLines(orgId, body?.lines, 'SUPPLIER');
    if (bill && priced.total > Number(bill.total) + 0.01) throw new CreditNoteError(`This credit (${priced.total.toFixed(2)}) is more than the bill (${Number(bill.total).toFixed(2)}).`);

    // What is being credited back: each line names the expense account (or Inventory) the cost was booked to.
    const accts = [...new Set(priced.lines.map((l) => l.account_id).filter(Boolean) as string[])];
    const { data: found } = accts.length ? await supabase.from('accounts').select('id, type').eq('organization_id', orgId).in('id', accts) : { data: [] as any[] };
    const valid = new Set((found ?? []).filter((a: any) => a.type === 'EXPENSE' || a.type === 'ASSET').map((a: any) => a.id));
    const credits = new Map<string, number>();
    for (const [i, l] of priced.lines.entries()) {
        if (!l.account_id || !valid.has(l.account_id)) throw new CreditNoteError(`Line ${i + 1}: choose the expense (or inventory) account this cost was booked to.`);
        credits.set(l.account_id, r2((credits.get(l.account_id) ?? 0) + l.net));
    }

    const number = await nextNumber(orgId, 'SUPPLIER');
    const id = randomUUID();
    const { data: note, error } = await supabase.from('credit_notes').insert({
        id, organization_id: orgId, direction: 'SUPPLIER', note_number: number, supplier_id: supplier.id, party_name: supplier.name, bill_id: bill?.id ?? null, issue_date: issueDate,
        reason: String(body?.reason ?? '').trim().slice(0, 300) || null, items: priced.lines, net: priced.net, vat_amount: priced.vat, total: priced.total, created_by: userId,
    }).select('*').single();
    if (error || !note) throw new CreditNoteError(error?.message ?? 'Could not save the credit note.', 500);

    try {
        const ap = await ensureAp(orgId);
        await post(orgId, userId, issueDate, `Supplier credit note ${number} — ${supplier.name}`, number, id, [
            { account_id: ap, debit: priced.total, credit: 0, description: 'Reduces what you owe the supplier' },
            ...[...credits].map(([account_id, v]) => ({ account_id, debit: 0, credit: v })),
            ...(priced.vat > 0 ? [{ account_id: await vat.vatInputAccount(orgId), debit: 0, credit: priced.vat, description: 'VAT recoverable reduced' }] : []),
        ]);
        if (priced.registered) {
            const by = new Map<string, { net: number; vat: number }>();
            for (const l of priced.lines) { const x = by.get(l.tax_code!) ?? { net: 0, vat: 0 }; x.net = r2(x.net + l.net); x.vat = r2(x.vat + l.vat); by.set(l.tax_code!, x); }
            await vat.recordTransactions(orgId, [...by].map(([code, v]) => ({ direction: 'INPUT' as const, code: code as vat.TaxCode, date: issueDate, net: -v.net, vat: -v.vat, sourceType: 'CREDIT_NOTE', sourceId: id, counterparty: supplier.name, reference: number })));
        }
    } catch (e) {
        await vat.removeTransactions(orgId, 'CREDIT_NOTE', id);
        await supabase.from('journal_entries').delete().eq('organization_id', orgId).eq('source_type', 'CREDIT_NOTE').eq('source_id', id);
        await supabase.from('credit_notes').delete().eq('id', id);
        throw e;
    }
    if (bill) await applyToBill(orgId, userId, id, bill.id).catch(() => undefined);
    const { data: fresh } = await supabase.from('credit_notes').select('*').eq('id', id).single();
    return fresh ?? note;
}

async function ensureAp(orgId: string): Promise<string> {
    const { data } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', 'ACCTS-PAYABLE').maybeSingle();
    if (data) return data.id;
    const { data: made, error } = await supabase.from('accounts').insert({ organization_id: orgId, code: 'ACCTS-PAYABLE', name: 'Accounts Payable', type: 'LIABILITY', subtype: 'Accounts Payable', is_active: true, description: 'Created by purchasing' }).select('id').single();
    if (error || !made) throw new CreditNoteError('Could not set up Accounts Payable.', 500);
    return made.id;
}

export async function applyToBill(orgId: string, userId: string, noteId: string, billId: string, amount?: number) {
    const { data: note } = await supabase.from('credit_notes').select('*').eq('organization_id', orgId).eq('id', noteId).eq('direction', 'SUPPLIER').maybeSingle();
    if (!note) throw new CreditNoteError('Credit note not found.', 404);
    if (note.status === 'VOID') throw new CreditNoteError('That credit note was cancelled.');
    const { data: bill } = await supabase.from('purchase_bills').select('id, status, total, amount_paid, supplier_id, requisition_id').eq('organization_id', orgId).eq('id', billId).maybeSingle();
    if (!bill || bill.status === 'VOID') throw new CreditNoteError('Bill not found, or it was cancelled.', 404);
    if (bill.supplier_id !== note.supplier_id) throw new CreditNoteError('That bill is from a different supplier.');
    if (bill.requisition_id) throw new CreditNoteError('A payment from your wallet is waiting for approval on this bill.');
    const left = r2(Number(note.total) - Number(note.amount_applied));
    const owed = r2(Number(bill.total) - Number(bill.amount_paid));
    const use = r2(Math.min(amount != null ? Number(amount) : left, left, owed));
    if (!(use > 0)) throw new CreditNoteError(left <= 0 ? 'This credit note has already been used up.' : 'That bill has nothing left to pay.');
    const { error } = await supabase.from('bill_payments').insert({ organization_id: orgId, bill_id: billId, amount: use, paid_on: today(), method: 'Credit note', reference: note.note_number, account_id: null, credit_note_id: noteId, created_by: userId });
    if (error) throw new CreditNoteError(error.message, 500);
    const paid = r2(Number(bill.amount_paid) + use);
    await supabase.from('purchase_bills').update({ amount_paid: paid, status: paid >= Number(bill.total) - 0.005 ? 'PAID' : 'PARTIAL', updated_at: new Date().toISOString() }).eq('id', billId);
    const applied = r2(Number(note.amount_applied) + use);
    await supabase.from('credit_notes').update({ amount_applied: applied, status: applied >= Number(note.total) - 0.005 ? 'APPLIED' : 'ISSUED', bill_id: note.bill_id ?? billId, updated_at: new Date().toISOString() }).eq('id', noteId);
    return { applied: use };
}

// ---------- both ----------

export async function listCreditNotes(orgId: string, dir?: string) {
    let q = supabase.from('credit_notes').select('*').eq('organization_id', orgId).order('issue_date', { ascending: false }).order('created_at', { ascending: false }).limit(500);
    if (dir === 'CUSTOMER' || dir === 'SUPPLIER') q = q.eq('direction', dir);
    const { data, error } = await q;
    if (error) throw new CreditNoteError(error.message, 500);
    return data ?? [];
}

/** Cancels a credit note: what it was applied to goes back to owing, and its entry and VAT are removed. */
export async function voidCreditNote(orgId: string, userId: string, noteId: string) {
    const { data: note } = await supabase.from('credit_notes').select('*').eq('organization_id', orgId).eq('id', noteId).maybeSingle();
    if (!note) throw new CreditNoteError('Credit note not found.', 404);
    if (note.status === 'VOID') return note;
    if (note.direction === 'CUSTOMER') {
        await supabase.from('invoice_payments').delete().eq('credit_note_id', noteId); // the invoice's paid amount follows by itself
    } else {
        const { data: pays } = await supabase.from('bill_payments').select('id, bill_id, amount').eq('credit_note_id', noteId);
        for (const p of (pays ?? []) as any[]) {
            const { data: b } = await supabase.from('purchase_bills').select('total, amount_paid').eq('id', p.bill_id).maybeSingle();
            if (b) { const paid = r2(Math.max(0, Number(b.amount_paid) - Number(p.amount))); await supabase.from('purchase_bills').update({ amount_paid: paid, status: paid >= Number(b.total) - 0.005 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'OPEN', updated_at: new Date().toISOString() }).eq('id', p.bill_id); }
        }
        await supabase.from('bill_payments').delete().eq('credit_note_id', noteId);
    }
    await supabase.from('journal_entries').delete().eq('organization_id', orgId).eq('source_type', 'CREDIT_NOTE').eq('source_id', noteId);
    await vat.removeTransactions(orgId, 'CREDIT_NOTE', noteId);
    await supabase.from('credit_notes').update({ status: 'VOID', amount_applied: 0, updated_at: new Date().toISOString() }).eq('id', noteId);
    await supabase.from('audit_logs').insert({ entity_type: 'CREDIT_NOTE', entity_id: noteId, action: 'VOIDED', user_id: userId, changes: { number: note.note_number } }).then(() => undefined, () => undefined);
    return { ...note, status: 'VOID' };
}

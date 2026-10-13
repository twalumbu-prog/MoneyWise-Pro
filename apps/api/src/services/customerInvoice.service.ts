/**
 * Credit sales (customer invoices) — recognise revenue now, collect cash later.
 *
 *   Issue invoice  →  Dr Accounts Receivable   Cr Income        (journal source_type = 'INVOICE', keyed by invoice id)
 *   Customer pays  →  the wallet INFLOW is classified to Accounts Receivable, which the cashbook posting engine
 *                     already turns into Dr Wallet / Cr Accounts Receivable. `invoice_payments` then records which
 *                     invoice(s) that inflow settles, and the invoice balance is derived from those rows (DB trigger).
 *
 * The AR account therefore always equals the sum of open invoice balances (+ any unapplied customer credit).
 */
import { supabase } from '../lib/supabase';
import { randomBytes } from 'crypto';
import { ledgerService } from './ledger.service';
import { emailService } from './email.service';
import { isValidZambiaMobile, normalizeZambiaPhone } from '../utils/zambiaPhone';

const TOLERANCE = 0.005;
export const AR_CODE = 'AR-TRADE';
const REVENUE_CODE = 'SALES-REVENUE';
// Master Fees keeps its own receivable pool (school fees); customer invoices never touch it.
const MASTERFEES_AR_CODE = 'QB-MF-AR';

const round2 = (n: number) => Math.round(n * 100) / 100;
const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const isDate = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const normPhone = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-9);

export class InvoiceError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

// ── Accounts ─────────────────────────────────────────────────────────────────

/** True for a customer-receivable ASSET account (not the Master Fees pool). */
export function isReceivableAccount(a: { type?: string | null; subtype?: string | null; name?: string | null; code?: string | null } | null | undefined): boolean {
    if (!a || a.type !== 'ASSET' || a.code === MASTERFEES_AR_CODE) return false;
    return /receivable/i.test(a.subtype || '') || /receivable/i.test(a.name || '');
}

async function findOrCreateAccount(orgId: string, spec: { code: string; name: string; type: 'ASSET' | 'INCOME'; subtype: string; description: string }): Promise<string> {
    const { data: found } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', spec.code).maybeSingle();
    if (found) return found.id;
    const { data, error } = await supabase.from('accounts').insert({ organization_id: orgId, ...spec }).select('id').single();
    if (data) return data.id;
    const { data: again } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', spec.code).maybeSingle();
    if (again) return again.id; // a concurrent request created it
    throw new InvoiceError(`Could not set up the ${spec.name} account: ${error?.message}`, 500);
}

/** The organisation's customer Accounts Receivable account — an existing one if the chart already has it, else created. */
export async function getReceivableAccountId(orgId: string): Promise<string> {
    const { data: existing } = await supabase
        .from('accounts')
        .select('id, code, name, type, subtype, is_active, created_at')
        .eq('organization_id', orgId)
        .eq('type', 'ASSET')
        .order('created_at', { ascending: true });
    const candidates = (existing || []).filter(a => a.is_active !== false && isReceivableAccount(a));
    if (candidates.length) return (candidates.find(a => a.code === AR_CODE) || candidates[0]).id;
    return findOrCreateAccount(orgId, {
        code: AR_CODE, name: 'Accounts Receivable', type: 'ASSET', subtype: 'Accounts Receivable',
        description: 'Money customers owe from credit sales (invoices issued less payments applied).',
    });
}

async function getDefaultRevenueAccountId(orgId: string): Promise<string> {
    return findOrCreateAccount(orgId, {
        code: REVENUE_CODE, name: 'Sales Revenue', type: 'INCOME', subtype: 'Sales',
        description: 'Revenue from credit sales that were not assigned to a specific income account.',
    });
}

// ── CRM ──────────────────────────────────────────────────────────────────────

/** Finds the CRM customer (by id, phone, email or exact name) or adds them. Returns the explicit customers-table row. */
export async function ensureCustomer(orgId: string, input: { id?: string | null; name: string; phone?: string | null; email?: string | null }): Promise<{ id: string; created: boolean }> {
    const name = input.name.trim();
    const phone = input.phone?.trim() || null;
    const email = input.email?.trim() || null;

    if (isUuid(input.id)) {
        const { data } = await supabase.from('customers').select('id').eq('id', input.id!).eq('organization_id', orgId).maybeSingle();
        if (data) return { id: data.id, created: false };
    }

    const { data: all } = await supabase.from('customers').select('id, name, phone, email').eq('organization_id', orgId);
    const np = normPhone(phone), ne = (email || '').toLowerCase(), nn = name.toLowerCase();
    const hit = (all || []).find(c =>
        (np && normPhone(c.phone) === np) ||
        (ne && (c.email || '').trim().toLowerCase() === ne) ||
        (c.name || '').trim().toLowerCase() === nn);
    if (hit) {
        // Fill gaps on the existing record so the invoice contact details are never lost.
        const patch: any = {};
        if (phone && !hit.phone) patch.phone = phone;
        if (email && !hit.email) patch.email = email;
        if (Object.keys(patch).length) await supabase.from('customers').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', hit.id);
        return { id: hit.id, created: false };
    }

    const { data, error } = await supabase.from('customers')
        .insert({ organization_id: orgId, name, phone, email, status: 'ACTIVE' }).select('id').single();
    if (error || !data) throw new InvoiceError(`Could not add the customer to the CRM: ${error?.message}`, 500);
    return { id: data.id, created: true };
}

// ── Ledger ───────────────────────────────────────────────────────────────────

/** (Re)builds the balanced journal for an invoice: Dr AR (total) / Cr income per line group. Idempotent. */
async function postInvoiceJournal(invoice: any): Promise<void> {
    await supabase.from('journal_entries').delete()
        .eq('organization_id', invoice.organization_id).eq('source_type', 'INVOICE').eq('source_id', invoice.id);
    if (invoice.status === 'VOID') return;

    const fallbackIncome = await getDefaultRevenueAccountId(invoice.organization_id);
    const income = new Map<string, number>();
    let sum = 0;
    for (const it of invoice.items as any[]) {
        const amt = round2(Number(it.unit_price) * Number(it.quantity));
        const acct = it.income_account_id || fallbackIncome;
        income.set(acct, round2((income.get(acct) || 0) + amt));
        sum = round2(sum + amt);
    }
    // Rounding / manual-total drift lands on the largest income line so the journal always ties to the invoice total.
    const drift = round2(Number(invoice.total) - sum);
    if (Math.abs(drift) > TOLERANCE && income.size) {
        const [top] = [...income.entries()].sort((a, b) => b[1] - a[1])[0];
        income.set(top, round2((income.get(top) || 0) + drift));
    }

    const lines = [
        { account_id: invoice.receivable_account_id, debit: Number(invoice.total), credit: 0 },
        ...[...income.entries()].filter(([, v]) => v > TOLERANCE).map(([account_id, v]) => ({ account_id, debit: 0, credit: v })),
    ];
    const dr = lines.reduce((s, l) => s + l.debit, 0), cr = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(dr - cr) > TOLERANCE) throw new InvoiceError(`Invoice journal does not balance (Dr ${dr} Cr ${cr}).`, 500);

    const { data: je, error } = await supabase.from('journal_entries').insert({
        organization_id: invoice.organization_id,
        entry_date: invoice.issue_date,
        description: `Credit sale ${invoice.invoice_number} — ${invoice.customer_name}`,
        reference_number: invoice.invoice_number,
        source_type: 'INVOICE',
        source_id: invoice.id,
        created_by: invoice.created_by,
    }).select('id').single();
    if (error || !je) throw new InvoiceError(`Could not post the invoice to the ledger: ${error?.message}`, 500);
    const { error: lineErr } = await supabase.from('journal_lines').insert(lines.map(l => ({ journal_entry_id: je.id, ...l })));
    if (lineErr) {
        await supabase.from('journal_entries').delete().eq('id', je.id);
        throw new InvoiceError(`Could not post the invoice lines: ${lineErr.message}`, 500);
    }
}

// ── Create ───────────────────────────────────────────────────────────────────

export interface CreateInvoiceInput {
    items: Array<{ product_id?: string; custom?: boolean; name?: string; quantity: number; price?: number; income_account_id?: string | null; check_in?: string; check_out?: string }>;
    customer: { id?: string | null; name: string; phone?: string | null; email?: string | null };
    follow_up_date: string;
    issue_date?: string;
    notes?: string | null;
}

export async function createInvoice(orgId: string, userId: string, input: CreateInvoiceInput) {
    const customerName = (input.customer?.name || '').trim();
    if (!customerName) throw new InvoiceError('Customer name is required.');
    if (!Array.isArray(input.items) || input.items.length === 0) throw new InvoiceError('Add at least one item to the invoice.');
    const issueDate = isDate(input.issue_date) ? input.issue_date! : new Date().toISOString().split('T')[0];
    if (!isDate(input.follow_up_date)) throw new InvoiceError('Enter the payment follow-up date.');
    if (input.follow_up_date < issueDate) throw new InvoiceError('The follow-up date cannot be before the invoice date.');

    // Products + income accounts used by the lines (all must belong to this organisation).
    const productIds = [...new Set(input.items.filter(i => i.product_id).map(i => i.product_id as string))];
    const { data: products } = productIds.length
        ? await supabase.from('products').select('id, name, price, income_account_id, product_type').eq('organization_id', orgId).in('id', productIds)
        : { data: [] as any[] };
    const productMap = new Map((products || []).map((p: any) => [p.id, p]));

    const customIncomeIds = [...new Set(input.items.filter(i => i.custom && i.income_account_id).map(i => i.income_account_id as string))];
    const validIncome = new Set<string>();
    if (customIncomeIds.length) {
        const { data: accts } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('type', 'INCOME').in('id', customIncomeIds);
        (accts || []).forEach((a: any) => validIncome.add(a.id));
    }

    const nightsOf = (ci: string, co: string) => Math.round((Date.parse(`${co}T00:00:00Z`) - Date.parse(`${ci}T00:00:00Z`)) / 86400000);
    const lines: any[] = [];
    for (const it of input.items) {
        if (it.custom || !it.product_id) {
            const name = (it.name || '').trim();
            const qty = Number(it.quantity), price = Number(it.price);
            if (!name) throw new InvoiceError('Every custom line needs a description.');
            if (!(qty > 0) || !Number.isFinite(price) || price <= 0) throw new InvoiceError(`Enter a quantity and price greater than 0 for "${name}".`);
            if (it.income_account_id && !validIncome.has(it.income_account_id)) throw new InvoiceError(`"${name}": choose one of your income accounts.`);
            lines.push({ name, quantity: qty, unit_price: round2(price), income_account_id: it.income_account_id || null, custom: true });
            continue;
        }
        const p: any = productMap.get(it.product_id);
        if (!p) throw new InvoiceError('One of the products was not found.', 404);
        const isBooking = !!(it.check_in && it.check_out);
        if (isBooking && (!isDate(it.check_in) || !isDate(it.check_out) || it.check_out! <= it.check_in!)) throw new InvoiceError('Invalid booking dates.');
        const quantity = isBooking ? nightsOf(it.check_in!, it.check_out!) : Math.max(0, Number(it.quantity) || 0);
        const clientPrice = Number(it.price);
        const unit = p.product_type === 'DONATION' || (Number.isFinite(clientPrice) && clientPrice > 0) ? clientPrice : Number(p.price) || 0;
        if (!(quantity > 0) || !(unit > 0)) throw new InvoiceError(`Set an amount greater than 0 for ${p.name}.`);
        lines.push({
            product_id: p.id, name: p.name, quantity, unit_price: round2(unit), income_account_id: p.income_account_id || null,
            ...(isBooking ? { check_in: it.check_in, check_out: it.check_out } : {}),
        });
    }
    const total = round2(lines.reduce((s, l) => s + l.unit_price * l.quantity, 0));
    if (!(total > 0)) throw new InvoiceError('The invoice total must be greater than 0.');

    // A credit sale commits the stay, so refuse up front if it overlaps one that is already confirmed.
    for (const l of lines.filter(l => l.check_in)) {
        const { data: clash } = await supabase.from('product_bookings').select('id')
            .eq('product_id', l.product_id).eq('status', 'CONFIRMED').lt('check_in', l.check_out).gt('check_out', l.check_in).limit(1);
        if (clash && clash.length) throw new InvoiceError(`${l.name} is already booked for those dates. Please choose different dates.`, 409);
    }

    const customer = await ensureCustomer(orgId, { ...input.customer, name: customerName });
    const receivableId = await getReceivableAccountId(orgId);
    const reference = `CSALE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // The unique (org, invoice_number) index arbitrates two cashiers racing for the same number: just retry.
    let invoice: any = null;
    for (let attempt = 0; attempt < 5 && !invoice; attempt++) {
        const { data: num } = await supabase.rpc('next_customer_invoice_number', { p_org_id: orgId });
        const { data, error } = await supabase.from('customer_invoices').insert({
            organization_id: orgId,
            invoice_number: num || `INV-${Date.now()}`,
            customer_id: customer.id,
            customer_name: customerName,
            customer_phone: input.customer.phone?.trim() || null,
            customer_email: input.customer.email?.trim() || null,
            issue_date: issueDate,
            follow_up_date: input.follow_up_date,
            items: lines,
            total,
            notes: input.notes?.trim() || null,
            reference,
            receivable_account_id: receivableId,
            created_by: userId,
        }).select('*').single();
        if (data) invoice = data;
        else if (error?.code !== '23505') throw new InvoiceError(`Could not create the invoice: ${error?.message}`, 500);
    }
    if (!invoice) throw new InvoiceError('Could not allocate an invoice number. Please try again.', 500);

    try {
        await postInvoiceJournal(invoice);
    } catch (e) {
        await supabase.from('customer_invoices').delete().eq('id', invoice.id); // never leave an invoice that is not on the books
        throw e;
    }

    // Product sales (stats, CRM spend) are recognised with the invoice, like a cash sale; void removes them.
    const saleRows = lines.filter(l => l.product_id && Number.isInteger(l.quantity)).map(l => ({
        organization_id: orgId, product_id: l.product_id, customer_name: customerName,
        customer_phone: input.customer.phone?.trim() || 'N/A', customer_email: input.customer.email?.trim() || null,
        quantity: l.quantity, amount_paid: round2(l.unit_price * l.quantity), reference, status: 'COMPLETED',
    }));
    if (saleRows.length) {
        const { error } = await supabase.from('product_sales').insert(saleRows);
        if (error) console.error(`[Invoice] product_sales insert failed for ${invoice.invoice_number}:`, error.message);
    }

    for (const l of lines.filter(l => l.check_in)) {
        const { error } = await supabase.from('product_bookings').insert({
            organization_id: orgId, product_id: l.product_id, reference,
            customer_name: customerName, customer_phone: input.customer.phone?.trim() || 'N/A',
            check_in: l.check_in, check_out: l.check_out, nights: l.quantity, amount: round2(l.unit_price * l.quantity), status: 'CONFIRMED',
        });
        if (error) {
            // A concurrent booking slipped in (GiST exclusion): keep the sale, flag the hold for the merchant to resolve.
            console.error(`[Invoice] booking insert failed for ${invoice.invoice_number}:`, error.message);
            if (error.code === '23P01') {
                await supabase.from('product_bookings').insert({
                    organization_id: orgId, product_id: l.product_id, reference, customer_name: customerName,
                    customer_phone: input.customer.phone?.trim() || 'N/A', check_in: l.check_in, check_out: l.check_out,
                    nights: l.quantity, amount: round2(l.unit_price * l.quantity), status: 'CONFLICT',
                });
            }
        }
    }

    return { invoice, customer_created: customer.created };
}

// ── Void ─────────────────────────────────────────────────────────────────────

export async function voidInvoice(orgId: string, invoiceId: string) {
    const { data: inv } = await supabase.from('customer_invoices').select('*').eq('id', invoiceId).eq('organization_id', orgId).maybeSingle();
    if (!inv) throw new InvoiceError('Invoice not found.', 404);
    if (inv.status === 'VOID') return inv;
    const { count } = await supabase.from('invoice_payments').select('id', { count: 'exact', head: true }).eq('invoice_id', invoiceId);
    if ((count || 0) > 0 || Number(inv.amount_paid) > 0) {
        throw new InvoiceError('This invoice already has payments applied. Remove them from the wallet transaction first, then void it.', 409);
    }
    const { data, error } = await supabase.from('customer_invoices')
        .update({ status: 'VOID', voided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', invoiceId).select('*').single();
    if (error || !data) throw new InvoiceError(`Could not void the invoice: ${error?.message}`, 500);
    await postInvoiceJournal(data); // VOID → removes the journal
    if (inv.reference) {
        await supabase.from('product_bookings').update({ status: 'CANCELLED' }).eq('organization_id', orgId).eq('reference', inv.reference);
        await supabase.from('product_sales').delete().eq('organization_id', orgId).eq('reference', inv.reference);
    }
    await deactivateInvoiceLinks(orgId, [invoiceId]);
    return data;
}

// ── Payment allocation ───────────────────────────────────────────────────────

/** Open invoices a payment can be applied to (optionally just one customer's). */
export async function listOpenInvoices(orgId: string, customerId?: string) {
    let q = supabase.from('customer_invoices').select('*').eq('organization_id', orgId).in('status', ['OPEN', 'PARTIAL'])
        .order('issue_date', { ascending: true }).order('created_at', { ascending: true });
    if (customerId) q = q.eq('customer_id', customerId);
    const { data, error } = await q;
    if (error) throw new InvoiceError(error.message, 500);
    return data || [];
}

export async function getAllocationsForEntry(orgId: string, entryId: string) {
    const { data } = await supabase.from('invoice_payments')
        .select('id, invoice_id, amount, created_at, customer_invoices(invoice_number, customer_id, customer_name, total, amount_paid, status)')
        .eq('organization_id', orgId).eq('cashbook_entry_id', entryId);
    return data || [];
}

/**
 * Applies (replaces) the allocation of one received wallet inflow across customer invoices. The inflow is also
 * classified to Accounts Receivable here (that is what makes the GL post Dr Wallet / Cr AR), so the money and the
 * invoice balances move together. Re-running with a new split simply replaces the earlier one.
 */
export async function allocatePayment(orgId: string, userId: string | null, entryId: string, allocations: { invoice_id: string; amount: number }[], opts: { keepLinkReference?: string } = {}) {
    const { data: entry } = await supabase.from('cashbook_entries')
        .select('id, organization_id, entry_type, debit, status, account_id').eq('id', entryId).eq('organization_id', orgId).maybeSingle();
    if (!entry) throw new InvoiceError('Transaction not found.', 404);
    const received = Number(entry.debit || 0);
    if (entry.entry_type !== 'INFLOW' || received <= 0) throw new InvoiceError('Only money received can be applied to invoices.');
    if (entry.status === 'PENDING') throw new InvoiceError('This payment is still pending — apply it once it has been received.');

    const wanted = (allocations || []).map(a => ({ invoice_id: a.invoice_id, amount: round2(Number(a.amount)) })).filter(a => a.amount > TOLERANCE);
    if (new Set(wanted.map(a => a.invoice_id)).size !== wanted.length) throw new InvoiceError('An invoice can only appear once per payment.');
    const applied = round2(wanted.reduce((s, a) => s + a.amount, 0));
    if (applied > received + TOLERANCE) throw new InvoiceError(`You are applying K${applied.toFixed(2)} but this payment is only K${received.toFixed(2)}.`);

    const { data: invoices } = wanted.length
        ? await supabase.from('customer_invoices').select('*').eq('organization_id', orgId).in('id', wanted.map(a => a.invoice_id))
        : { data: [] as any[] };
    const byId = new Map((invoices || []).map((i: any) => [i.id, i]));

    // What the other payments have already settled (this entry's own earlier allocation is being replaced).
    const { data: others } = wanted.length
        ? await supabase.from('invoice_payments').select('invoice_id, amount').in('invoice_id', wanted.map(a => a.invoice_id)).neq('cashbook_entry_id', entryId)
        : { data: [] as any[] };
    const paidElsewhere = new Map<string, number>();
    (others || []).forEach((p: any) => paidElsewhere.set(p.invoice_id, (paidElsewhere.get(p.invoice_id) || 0) + Number(p.amount)));

    for (const a of wanted) {
        const inv: any = byId.get(a.invoice_id);
        if (!inv) throw new InvoiceError('One of the invoices was not found.', 404);
        if (inv.status === 'VOID') throw new InvoiceError(`${inv.invoice_number} has been voided.`);
        const balance = round2(Number(inv.total) - (paidElsewhere.get(inv.id) || 0));
        if (a.amount > balance + TOLERANCE) throw new InvoiceError(`${inv.invoice_number} only has K${balance.toFixed(2)} outstanding.`);
    }

    // Classify the inflow to the invoices' receivable account (or the org's AR account when nothing is applied yet).
    const receivableId = (wanted.length ? (byId.get(wanted[0].invoice_id) as any)?.receivable_account_id : null) || await getReceivableAccountId(orgId);

    await supabase.from('invoice_payments').delete().eq('organization_id', orgId).eq('cashbook_entry_id', entryId);
    if (wanted.length) {
        const { error } = await supabase.from('invoice_payments').insert(
            wanted.map(a => ({ organization_id: orgId, invoice_id: a.invoice_id, cashbook_entry_id: entryId, amount: a.amount, applied_by: userId })));
        if (error) throw new InvoiceError(`Could not apply the payment: ${error.message}`, error.code === '23514' ? 409 : 500);
    }

    await supabase.from('cashbook_entries').update({ account_id: receivableId, status: entry.status === 'COMPLETED' || entry.status === 'UNACCOUNTED' ? 'ACCOUNTED' : entry.status })
        .eq('id', entryId).eq('organization_id', orgId);
    await ledgerService.repostForCashbookEntry(entryId).catch(e => console.error(`[Invoice] repost failed for ${entryId}:`, e?.message));

    // Once an invoice is fully paid its pay-by-link link must not be payable again.
    const { data: nowPaid } = wanted.length
        ? await supabase.from('customer_invoices').select('id').in('id', wanted.map(a => a.invoice_id)).eq('status', 'PAID')
        : { data: [] as any[] };
    if (nowPaid?.length) await deactivateInvoiceLinks(orgId, nowPaid.map((i: any) => i.id), opts.keepLinkReference);

    return { applied, unapplied: round2(received - applied), allocations: await getAllocationsForEntry(orgId, entryId) };
}

/**
 * If an inflow that had invoices applied is re-classified to something that is NOT a receivable account, the
 * invoices must not stay "paid" by money that no longer reduces AR — release the allocation.
 */
export async function releaseAllocationsIfNotReceivable(orgId: string, entryId: string, newAccountId: string | null): Promise<void> {
    const { count } = await supabase.from('invoice_payments').select('id', { count: 'exact', head: true }).eq('cashbook_entry_id', entryId);
    if (!count) return;
    if (newAccountId) {
        const { data: acct } = await supabase.from('accounts').select('type, subtype, name, code').eq('id', newAccountId).maybeSingle();
        if (isReceivableAccount(acct as any)) return;
    }
    await supabase.from('invoice_payments').delete().eq('organization_id', orgId).eq('cashbook_entry_id', entryId);
}

// ── Pay-by-link ──────────────────────────────────────────────────────────────

/** Cancels the still-ACTIVE payment links of these invoices (except the link currently being settled). */
export async function deactivateInvoiceLinks(orgId: string, invoiceIds: string[], exceptReference?: string): Promise<void> {
    if (!invoiceIds.length) return;
    let q = supabase.from('payment_links').update({ status: 'CANCELLED' })
        .eq('organization_id', orgId).in('credit_invoice_id', invoiceIds).eq('status', 'ACTIVE');
    if (exceptReference) q = q.or(`reference.is.null,reference.neq.${exceptReference}`);
    const { error } = await q;
    if (error) console.error('[Invoice] could not deactivate payment links:', error.message);
}

export interface InvoicePayLink { id: string; token: string; amount: number; status: string; path: string }

/**
 * The invoice's one-time "Pay now" link, created on demand. It always charges the CURRENT balance, so a link made
 * before a part-payment is replaced rather than over-charging the customer.
 */
export async function ensurePayLink(orgId: string, userId: string | null, invoiceId: string): Promise<InvoicePayLink> {
    const { data: inv } = await supabase.from('customer_invoices').select('*').eq('id', invoiceId).eq('organization_id', orgId).maybeSingle();
    if (!inv) throw new InvoiceError('Invoice not found.', 404);
    if (inv.status === 'VOID') throw new InvoiceError('A voided invoice cannot be paid.');
    const balance = round2(Number(inv.total) - Number(inv.amount_paid || 0));
    if (inv.status === 'PAID' || balance <= TOLERANCE) throw new InvoiceError('This invoice is already paid.');

    const { data: existing } = await supabase.from('payment_links').select('id, token, amount, status')
        .eq('organization_id', orgId).eq('credit_invoice_id', invoiceId).eq('status', 'ACTIVE').order('created_at', { ascending: false });
    const current = (existing || []).find(l => Math.abs(Number(l.amount) - balance) < TOLERANCE);
    if (current) return { ...current, amount: Number(current.amount), path: `/pl/${current.token}` };
    if (existing?.length) await supabase.from('payment_links').update({ status: 'CANCELLED' }).in('id', existing.map(l => l.id));

    const { data: wallet } = await supabase.from('organization_wallets').select('id').eq('organization_id', orgId).eq('is_main', true).maybeSingle();
    // Stays are already reserved by the invoice itself, so the link carries them as plain priced lines (no dates → no second booking).
    const items = balance >= Number(inv.total) - TOLERANCE
        ? (inv.items as any[]).map(it => ({
            ...(it.product_id ? { product_id: it.product_id } : {}),
            name: it.check_in && it.check_out ? `${it.name} (${it.check_in} → ${it.check_out})` : it.name,
            quantity: it.quantity, unit_price: it.unit_price,
        }))
        : [{ name: `Balance due on ${inv.invoice_number}`, quantity: 1, unit_price: balance }];

    const token = randomBytes(24).toString('base64url');
    const phone = inv.customer_phone && isValidZambiaMobile(inv.customer_phone) ? normalizeZambiaPhone(inv.customer_phone) : '';
    const { data: link, error } = await supabase.from('payment_links').insert({
        organization_id: orgId, product_id: null, token, customer_name: inv.customer_name, customer_phone: phone,
        customer_email: inv.customer_email, amount: balance, items, wallet_id: wallet?.id || null, status: 'ACTIVE',
        credit_invoice_id: invoiceId, created_by: userId,
    }).select('id, token, amount, status').single();
    if (error || !link) throw new InvoiceError(`Could not create the payment link: ${error?.message}`, 500);
    return { ...link, amount: Number(link.amount), path: `/pl/${link.token}` };
}

/** The invoice's currently payable link, if any (no side effects). */
export async function getActivePayLink(orgId: string, invoiceId: string): Promise<InvoicePayLink | null> {
    const { data } = await supabase.from('payment_links').select('id, token, amount, status')
        .eq('organization_id', orgId).eq('credit_invoice_id', invoiceId).eq('status', 'ACTIVE').order('created_at', { ascending: false }).limit(1).maybeSingle();
    return data ? { ...data, amount: Number(data.amount), path: `/pl/${data.token}` } : null;
}

/**
 * Called from the payment-link finalization (revenue routing step). When the paid reference belongs to a credit
 * invoice's link, the money settles the receivable — it is NOT new revenue, so the normal product-revenue routing is
 * skipped. Returns true when the reference was a credit-invoice payment (handled or waiting for its inflow).
 * Idempotent: a re-run (sync/heal) never overwrites an allocation that already exists for the inflow.
 */
export async function settleCreditInvoiceByReference(orgId: string, reference: string): Promise<boolean> {
    const { data: link } = await supabase.from('payment_links').select('credit_invoice_id')
        .eq('organization_id', orgId).eq('reference', reference).not('credit_invoice_id', 'is', null).maybeSingle();
    if (!link?.credit_invoice_id) return false;

    const { data: entry } = await supabase.from('cashbook_entries').select('id, debit')
        .eq('organization_id', orgId).eq('external_reference', reference).eq('entry_type', 'INFLOW').neq('status', 'PENDING').maybeSingle();
    if (!entry) return true; // payment not on the ledger yet — a later pass (webhook/sync) will settle it

    const { count } = await supabase.from('invoice_payments').select('id', { count: 'exact', head: true }).eq('cashbook_entry_id', entry.id);
    if (count) return true;

    const { data: inv } = await supabase.from('customer_invoices').select('id, total, amount_paid, status').eq('id', link.credit_invoice_id).maybeSingle();
    if (!inv || inv.status === 'VOID') return true;
    const balance = round2(Number(inv.total) - Number(inv.amount_paid || 0));
    const apply = round2(Math.min(Number(entry.debit || 0), balance));
    try {
        await allocatePayment(orgId, null, entry.id, apply > TOLERANCE ? [{ invoice_id: inv.id, amount: apply }] : [], { keepLinkReference: reference });
        console.log(`[Invoice] link payment ${reference} applied K${apply} to invoice ${inv.id}`);
    } catch (e: any) {
        console.error(`[Invoice] could not apply link payment ${reference}:`, e?.message);
    }
    return true;
}

// ── Follow-up reminders ──────────────────────────────────────────────────────

/**
 * Emails the finance team about invoices whose follow-up date has arrived: once on the day, then weekly while still
 * unpaid. Safe to run often (it only acts on invoices that are due a reminder). Returns how many were reminded.
 */
export async function runInvoiceReminders(): Promise<{ invoices: number; organizations: number }> {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: due } = await supabase.from('customer_invoices')
        .select('id, organization_id, invoice_number, customer_name, customer_phone, follow_up_date, total, amount_paid, reminder_count')
        .in('status', ['OPEN', 'PARTIAL']).lte('follow_up_date', today)
        .or(`last_reminder_at.is.null,last_reminder_at.lt.${weekAgo}`)
        .order('follow_up_date', { ascending: true }).limit(500);
    if (!due?.length) return { invoices: 0, organizations: 0 };

    const byOrg = new Map<string, typeof due>();
    for (const i of due) byOrg.set(i.organization_id, [...(byOrg.get(i.organization_id) || []), i]);

    let reminded = 0;
    for (const [orgId, list] of byOrg) {
        try {
            const sent = await emailService.notifyInvoiceFollowUps(orgId, list.map(i => ({
                invoiceNumber: i.invoice_number, customerName: i.customer_name, customerPhone: i.customer_phone,
                followUpDate: i.follow_up_date, balance: round2(Number(i.total) - Number(i.amount_paid || 0)),
            })));
            if (!sent) continue; // no recipients / email not configured → try again next tick
            for (const i of list) {
                await supabase.from('customer_invoices').update({ last_reminder_at: new Date().toISOString(), reminder_count: Number((i as any).reminder_count || 0) + 1 }).eq('id', i.id);
            }
            reminded += list.length;
        } catch (e: any) {
            console.error(`[Invoice] reminder failed for org ${orgId}:`, e?.message);
        }
    }
    return { invoices: reminded, organizations: byOrg.size };
}

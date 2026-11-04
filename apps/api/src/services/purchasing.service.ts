import { supabase } from '../lib/supabase';

/**
 * Suppliers, purchase bills and stock movements, posted to the double-entry ledger. Enterprise plan; the route enforces that.
 *
 *  - A bill is what you owe a supplier. Posting it: Dr Inventory (stock lines) or Dr the chosen expense account (other lines), Cr Accounts Payable.
 *    Stock lines also raise the product's stock and update its average cost.
 *  - Paying a bill: Dr Accounts Payable, Cr the bank/cash/wallet account the money left.
 *  - A stock adjustment (damage, theft, a count that differs): at the product's average cost, Dr/Cr Inventory against "Inventory adjustments".
 * Payments here are recorded against the books; they don't send money from a Lenco wallet.
 */

export class PurchasingError extends Error { constructor(message: string, readonly httpStatus = 400) { super(message); } }

const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
const text = (v: unknown, n: number) => { const s = String(v ?? '').trim().slice(0, n); return s || null; };

async function ensureAccount(orgId: string, code: string, name: string, type: string, subtype: string): Promise<string> {
    const { data } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', code).maybeSingle();
    if (data) return data.id;
    const { data: made, error } = await supabase.from('accounts').insert({ organization_id: orgId, code, name, type, subtype, is_active: true, description: 'Created by purchasing' }).select('id').single();
    if (error || !made) {
        const { data: again } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', code).maybeSingle();
        if (again) return again.id;
        throw new PurchasingError(`Could not set up the ${name} account.`, 500);
    }
    return made.id;
}
const inventoryAcct = (o: string) => ensureAccount(o, 'INVENTORY', 'Inventory', 'ASSET', 'Inventory');
const payablesAcct = (o: string) => ensureAccount(o, 'ACCTS-PAYABLE', 'Accounts Payable', 'LIABILITY', 'Accounts Payable');
const adjustmentAcct = (o: string) => ensureAccount(o, 'INV-ADJUSTMENTS', 'Inventory adjustments', 'EXPENSE', 'Expense');

interface PostLine { accountId: string; debit: number; credit: number; memo?: string }
async function postJournal(orgId: string, userId: string | null, date: string, memo: string, ref: string, sourceType: string, sourceId: string, lines: PostLine[]) {
    const debit = r2(lines.reduce((s, l) => s + l.debit, 0)), credit = r2(lines.reduce((s, l) => s + l.credit, 0));
    if (Math.abs(debit - credit) >= 0.01) throw new PurchasingError('That entry would not balance.', 500);
    const { data: je, error } = await supabase.from('journal_entries').insert({ organization_id: orgId, entry_date: date, description: memo, reference_number: ref, source_type: sourceType, source_id: sourceId, created_by: userId }).select('id').single();
    if (error || !je) throw new PurchasingError(`Could not post to the ledger: ${error?.message}`, 500);
    const { error: le } = await supabase.from('journal_lines').insert(lines.filter((l) => l.debit || l.credit).map((l) => ({ journal_entry_id: je.id, account_id: l.accountId, debit: l.debit, credit: l.credit, description: l.memo ?? null })));
    if (le) { await supabase.from('journal_entries').delete().eq('id', je.id); throw new PurchasingError(`Could not post to the ledger: ${le.message}`, 500); }
}
const unpost = async (orgId: string, sourceType: string, sourceId: string) => { await supabase.from('journal_entries').delete().eq('organization_id', orgId).eq('source_type', sourceType).eq('source_id', sourceId); };

// ---------- suppliers ----------

export async function listSuppliers(orgId: string) {
    await syncWalletPayments(orgId).catch(() => undefined);
    const [{ data: sups, error }, { data: bills }] = await Promise.all([
        supabase.from('suppliers').select('*').eq('organization_id', orgId).order('name').range(0, 4999),
        supabase.from('purchase_bills').select('supplier_id, total, amount_paid, status, due_date').eq('organization_id', orgId).neq('status', 'VOID').range(0, 49999),
    ]);
    if (error) throw new PurchasingError(error.message, 500);
    const now = today();
    const by = new Map<string, { owed: number; overdue: number; bills: number }>();
    for (const b of (bills ?? []) as any[]) {
        const x = by.get(b.supplier_id) ?? { owed: 0, overdue: 0, bills: 0 };
        const open = r2(Number(b.total) - Number(b.amount_paid));
        x.bills++; if (open > 0) { x.owed = r2(x.owed + open); if (b.due_date < now) x.overdue = r2(x.overdue + open); }
        by.set(b.supplier_id, x);
    }
    return (sups ?? []).map((s: any) => ({ ...s, ...(by.get(s.id) ?? { owed: 0, overdue: 0, bills: 0 }) }));
}

export async function saveSupplier(orgId: string, body: any, id?: string) {
    const name = text(body?.name, 120);
    if (!name) throw new PurchasingError('Give the supplier a name.');
    const row = {
        name, contact_person: text(body.contactPerson, 120), phone: text(body.phone, 40), email: text(body.email, 160), address: text(body.address, 300),
        tax_number: text(body.taxNumber, 40), notes: text(body.notes, 1000), payment_terms_days: Math.min(365, Math.max(0, Math.floor(Number(body.paymentTermsDays ?? 30) || 0))),
        is_active: body.isActive !== false, updated_at: new Date().toISOString(),
        // Where a payment from a wallet is sent. Left empty, the supplier can only be paid by recording a payment made elsewhere.
        payout_method: ['BANK', 'MOBILE_MONEY'].includes(body.payoutMethod) ? body.payoutMethod : null,
        payout_bank_code: text(body.payoutBankCode, 40), payout_account: text(body.payoutAccount, 40), payout_account_name: text(body.payoutAccountName, 120),
    };
    if (row.payout_method && (!row.payout_account || !row.payout_bank_code)) throw new PurchasingError('Add the bank (or mobile money network) and the account (or phone) number, or leave the payout details empty.');
    if (id) {
        const { data, error } = await supabase.from('suppliers').update(row).eq('organization_id', orgId).eq('id', id).select('*').maybeSingle();
        if (error) throw new PurchasingError(error.message, 500);
        if (!data) throw new PurchasingError('Supplier not found.', 404);
        return data;
    }
    const { data, error } = await supabase.from('suppliers').insert({ ...row, organization_id: orgId }).select('*').single();
    if (error) throw new PurchasingError(error.message, 500);
    return data;
}

export async function supplierDetail(orgId: string, id: string) {
    await syncWalletPayments(orgId).catch(() => undefined);
    const { data: supplier } = await supabase.from('suppliers').select('*').eq('organization_id', orgId).eq('id', id).maybeSingle();
    if (!supplier) throw new PurchasingError('Supplier not found.', 404);
    const { data: bills } = await supabase.from('purchase_bills').select('*, purchase_bill_lines(*), bill_payments(*)').eq('organization_id', orgId).eq('supplier_id', id).order('bill_date', { ascending: false }).range(0, 999);
    return { supplier, bills: bills ?? [] };
}

// ---------- bills ----------

interface LineIn { productId?: string; variantId?: string; accountId?: string; description?: string; quantity?: number; unitCost?: number }

const variantsOf = (p: any): any[] => (Array.isArray(p?.variants) ? p.variants : []);
const totalStock = (p: any) => (variantsOf(p).length ? variantsOf(p).reduce((s, v) => s + (Number(v.stock) || 0), 0) : Math.max(0, Number(p?.stock_quantity) || 0));

/** Adds `qty` (or takes it away, if negative) from a product's count, or from one option's count when it is tracked by colour or size. */
async function applyStock(p: any, variantId: string | null | undefined, qty: number) {
    if (variantsOf(p).length) {
        const vs = variantsOf(p).map((v) => (v.id === variantId ? { ...v, stock: Math.max(0, (Number(v.stock) || 0) + qty) } : v));
        await supabase.from('products').update({ variants: vs }).eq('id', p.id);
        p.variants = vs;
    } else {
        const next = Math.max(0, (Number(p.stock_quantity) || 0) + qty);
        await supabase.from('products').update({ stock_quantity: next }).eq('id', p.id);
        p.stock_quantity = next;
    }
}
const stockOf = (p: any, variantId?: string | null) => (variantsOf(p).length ? Number(variantsOf(p).find((v) => v.id === variantId)?.stock) || 0 : Math.max(0, Number(p.stock_quantity) || 0));

export async function createBill(orgId: string, userId: string, body: any) {
    const { data: supplier } = await supabase.from('suppliers').select('id, payment_terms_days').eq('organization_id', orgId).eq('id', String(body?.supplierId ?? '')).maybeSingle();
    if (!supplier) throw new PurchasingError('Choose a supplier.');
    const billDate = isDate(body.billDate) ? body.billDate : today();
    const dueDate = isDate(body.dueDate) ? body.dueDate : addDays(billDate, supplier.payment_terms_days ?? 30);
    const raw: LineIn[] = Array.isArray(body.lines) ? body.lines.slice(0, 200) : [];
    if (!raw.length) throw new PurchasingError('Add at least one line to the bill.');

    const productIds = [...new Set(raw.map((l) => l.productId).filter(Boolean) as string[])];
    const { data: prods } = productIds.length ? await supabase.from('products').select('id, name, track_stock, stock_quantity, variants, cost_price').eq('organization_id', orgId).in('id', productIds) : { data: [] as any[] };
    const pById = new Map<string, any>((prods ?? []).map((p: any) => [p.id, p]));
    const accountIds = [...new Set(raw.map((l) => l.accountId).filter(Boolean) as string[])];
    const { data: accts } = accountIds.length ? await supabase.from('accounts').select('id, type').eq('organization_id', orgId).in('id', accountIds) : { data: [] as any[] };
    const aById = new Map<string, any>((accts ?? []).map((a: any) => [a.id, a]));

    const lines = raw.map((l, i) => {
        const quantity = Math.floor(Number(l.quantity));
        const unitCost = r2(Number(l.unitCost));
        if (!(quantity > 0)) throw new PurchasingError(`Line ${i + 1}: enter a quantity of at least 1.`);
        if (!(unitCost >= 0)) throw new PurchasingError(`Line ${i + 1}: enter the unit cost.`);
        if (l.productId) {
            const p = pById.get(l.productId);
            if (!p) throw new PurchasingError(`Line ${i + 1}: that product wasn't found.`);
            if (!p.track_stock) throw new PurchasingError(`Line ${i + 1}: turn on stock tracking for “${p.name}” first.`);
            let variantId: string | null = null;
            let label = p.name as string;
            if (variantsOf(p).length) {
                const v = variantsOf(p).find((x) => x.id === l.variantId);
                if (!v) throw new PurchasingError(`Line ${i + 1}: choose which option of “${p.name}” (colour or size) arrived.`);
                variantId = v.id; label = `${p.name} (${v.name})`;
            }
            return { productId: l.productId, variantId, accountId: null as string | null, description: String(l.description || label).slice(0, 200), quantity, unitCost, lineTotal: r2(quantity * unitCost) };
        }
        const a = l.accountId ? aById.get(l.accountId) : null;
        if (!a || a.type !== 'EXPENSE') throw new PurchasingError(`Line ${i + 1}: choose a product, or an expense account for this line.`);
        if (!String(l.description ?? '').trim()) throw new PurchasingError(`Line ${i + 1}: describe what this is.`);
        return { productId: null as string | null, variantId: null as string | null, accountId: l.accountId!, description: String(l.description).slice(0, 200), quantity, unitCost, lineTotal: r2(quantity * unitCost) };
    });
    const total = r2(lines.reduce((s, l) => s + l.lineTotal, 0));
    if (!(total > 0)) throw new PurchasingError('The bill total must be more than zero.');
    const billNumber = text(body.billNumber, 60);

    const { data: bill, error } = await supabase.from('purchase_bills').insert({
        organization_id: orgId, supplier_id: supplier.id, bill_number: billNumber, bill_date: billDate, due_date: dueDate, total, notes: text(body.notes, 1000), created_by: userId,
    }).select('*').single();
    if (error || !bill) throw new PurchasingError(/uq_purchase_bills_number|duplicate/i.test(error?.message ?? '') ? 'That supplier already has a bill with this number.' : (error?.message ?? 'Could not save the bill.'), /duplicate|uq_/i.test(error?.message ?? '') ? 409 : 500);

    try {
        const { error: le } = await supabase.from('purchase_bill_lines').insert(lines.map((l) => ({ bill_id: bill.id, product_id: l.productId, variant_id: l.variantId, account_id: l.accountId, description: l.description, quantity: l.quantity, unit_cost: l.unitCost, line_total: l.lineTotal })));
        if (le) throw new PurchasingError(le.message, 500);

        const inv = await inventoryAcct(orgId), ap = await payablesAcct(orgId);
        const debits = new Map<string, number>();
        for (const l of lines) { const acct = l.productId ? inv : l.accountId!; debits.set(acct, r2((debits.get(acct) ?? 0) + l.lineTotal)); }
        await postJournal(orgId, userId, billDate, `Bill ${billNumber ?? bill.id.slice(0, 8)}`, `BILL-${billNumber ?? bill.id.slice(0, 8)}`, 'PURCHASE_BILL', bill.id, [
            ...[...debits].map(([accountId, debit]) => ({ accountId, debit, credit: 0 })), { accountId: ap, debit: 0, credit: total, memo: 'Owed to supplier' },
        ]);

        // Stock in: the count goes up and the average cost moves with it.
        for (const l of lines.filter((x) => x.productId)) {
            const p = pById.get(l.productId!);
            // The average cost is kept for the whole product, across all its options.
            const before = totalStock(p), after = before + l.quantity;
            const oldCost = Number(p.cost_price) || 0;
            const avg = r2(before > 0 && oldCost > 0 ? (before * oldCost + l.quantity * l.unitCost) / after : l.unitCost);
            await applyStock(p, l.variantId, l.quantity);
            await supabase.from('products').update({ cost_price: avg }).eq('id', l.productId!);
            p.cost_price = avg; // a second line for the same product builds on this
            await supabase.from('stock_movements').insert({ organization_id: orgId, product_id: l.productId, variant_id: l.variantId, quantity_change: l.quantity, unit_cost: l.unitCost, reason: 'PURCHASE', ref_type: 'PURCHASE_BILL', ref_id: bill.id, balance_after: stockOf(p, l.variantId), created_by: userId });
        }
    } catch (e) {
        await unpost(orgId, 'PURCHASE_BILL', bill.id);
        await supabase.from('purchase_bills').delete().eq('id', bill.id);
        throw e;
    }
    return bill;
}

export async function payBill(orgId: string, userId: string, billId: string, body: any) {
    const { data: bill } = await supabase.from('purchase_bills').select('*').eq('organization_id', orgId).eq('id', billId).maybeSingle();
    if (!bill) throw new PurchasingError('Bill not found.', 404);
    if (bill.status === 'VOID') throw new PurchasingError('That bill was cancelled.');
    if (bill.requisition_id) throw new PurchasingError('A payment from your wallet is already waiting for approval on this bill.');
    const open = r2(Number(bill.total) - Number(bill.amount_paid));
    const amount = r2(Number(body?.amount));
    if (!(amount > 0)) throw new PurchasingError('Enter the amount paid.');
    if (amount > open + 0.001) throw new PurchasingError(`Only ${open.toFixed(2)} is still owed on this bill.`);
    const { data: acct } = await supabase.from('accounts').select('id, type').eq('organization_id', orgId).eq('id', String(body?.accountId ?? '')).maybeSingle();
    if (!acct || acct.type !== 'ASSET') throw new PurchasingError('Choose the bank, cash or wallet account the money came from.');
    const paidOn = isDate(body.paidOn) ? body.paidOn : today();

    const { data: pay, error } = await supabase.from('bill_payments').insert({ organization_id: orgId, bill_id: billId, amount, paid_on: paidOn, method: text(body.method, 40), reference: text(body.reference, 80), account_id: acct.id, created_by: userId }).select('*').single();
    if (error || !pay) throw new PurchasingError(error?.message ?? 'Could not save the payment.', 500);
    try {
        const ap = await payablesAcct(orgId);
        await postJournal(orgId, userId, paidOn, `Payment for bill ${bill.bill_number ?? bill.id.slice(0, 8)}`, `PAY-${pay.id.slice(0, 8)}`, 'BILL_PAYMENT', pay.id, [
            { accountId: ap, debit: amount, credit: 0 }, { accountId: acct.id, debit: 0, credit: amount },
        ]);
    } catch (e) { await supabase.from('bill_payments').delete().eq('id', pay.id); throw e; }
    const paid = r2(Number(bill.amount_paid) + amount);
    await supabase.from('purchase_bills').update({ amount_paid: paid, status: paid >= Number(bill.total) - 0.001 ? 'PAID' : 'PARTIAL', updated_at: new Date().toISOString() }).eq('id', billId);
    return pay;
}

export async function voidBill(orgId: string, userId: string, billId: string) {
    const { data: bill } = await supabase.from('purchase_bills').select('*, purchase_bill_lines(*)').eq('organization_id', orgId).eq('id', billId).maybeSingle();
    if (!bill) throw new PurchasingError('Bill not found.', 404);
    if (bill.status === 'VOID') return bill;
    if (Number(bill.amount_paid) > 0) throw new PurchasingError('This bill has payments. Remove the payments before cancelling it.');
    const stockLines = (bill.purchase_bill_lines ?? []).filter((l: any) => l.product_id);
    const load = async (id: string) => (await supabase.from('products').select('id, stock_quantity, variants').eq('id', id).maybeSingle()).data;
    for (const l of stockLines) {
        const p = await load(l.product_id);
        if (p && stockOf(p, l.variant_id) < l.quantity) throw new PurchasingError('Some of this stock has already been sold, so the bill can’t be cancelled. Record a return to the supplier instead.');
    }
    for (const l of stockLines) {
        const p = await load(l.product_id);
        if (!p) continue;
        await applyStock(p, l.variant_id, -l.quantity);
        await supabase.from('stock_movements').insert({ organization_id: orgId, product_id: l.product_id, variant_id: l.variant_id ?? null, quantity_change: -l.quantity, unit_cost: l.unit_cost, reason: 'VOID', ref_type: 'PURCHASE_BILL', ref_id: bill.id, balance_after: stockOf(p, l.variant_id), created_by: userId });
    }
    await unpost(orgId, 'PURCHASE_BILL', bill.id);
    await supabase.from('purchase_bills').update({ status: 'VOID', updated_at: new Date().toISOString() }).eq('id', billId);
    return { ...bill, status: 'VOID' };
}

export async function listBills(orgId: string, status?: string) {
    await syncWalletPayments(orgId).catch(() => undefined);
    let q = supabase.from('purchase_bills').select('*, suppliers(name)').eq('organization_id', orgId).order('bill_date', { ascending: false }).range(0, 999);
    if (status && ['OPEN', 'PARTIAL', 'PAID', 'VOID'].includes(status)) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new PurchasingError(error.message, 500);
    return data ?? [];
}

// ---------- paying from a wallet ----------

const PAID_STATES = ['DISBURSED', 'RECEIVED', 'ACCOUNTED', 'COMPLETED'];
const DEAD_STATES = ['REJECTED', 'CANCELLED'];

/**
 * Sends a bill's payment through the normal requisition flow, so it goes through your approvals, PIN and wallet checks like any other payout, and
 * the supplier is paid with the details saved on them. The requisition's line is classed to Accounts Payable, so when it is paid the books move
 * Dr Accounts Payable, Cr the wallet by themselves. The bill is marked paid when the requisition is (see syncWalletPayments).
 */
export async function requestWalletPayment(orgId: string, userId: string, billId: string, body: any) {
    const { data: bill } = await supabase.from('purchase_bills').select('*, suppliers(*)').eq('organization_id', orgId).eq('id', billId).maybeSingle();
    if (!bill) throw new PurchasingError('Bill not found.', 404);
    await syncWalletPayments(orgId);
    const { data: fresh } = await supabase.from('purchase_bills').select('status, total, amount_paid, requisition_id').eq('id', billId).single();
    if (!fresh || fresh.status === 'VOID' || fresh.status === 'PAID') throw new PurchasingError('This bill has nothing left to pay.');
    if (fresh.requisition_id) throw new PurchasingError('A payment for this bill has already been requested. Approve and pay it from your Inbox.');
    const s = bill.suppliers;
    if (!s?.payout_method || !s.payout_account || !s.payout_bank_code) throw new PurchasingError('Add the supplier’s bank or mobile money details first, so we know where to send the money.');
    const open = r2(Number(fresh.total) - Number(fresh.amount_paid));
    const amount = body?.amount != null && body.amount !== '' ? r2(Number(body.amount)) : open;
    if (!(amount > 0) || amount > open + 0.001) throw new PurchasingError(`Enter an amount up to ${open.toFixed(2)}.`);

    const ap = await payablesAcct(orgId);
    const label = `Pay ${s.name}${bill.bill_number ? ` · bill ${bill.bill_number}` : ''}`;
    const lineMethod = s.payout_method === 'MOBILE_MONEY' ? 'MOBILE_MONEY' : 'BANK';
    const { data: reqRow, error } = await supabase.from('requisitions').insert({
        requestor_id: userId, organization_id: orgId, description: label, estimated_total: amount, status: 'DRAFT', type: 'EXPENSE',
        wallet_id: body?.walletId || null, payment_method: s.payout_method === 'MOBILE_MONEY' ? 'MOBILE_MONEY' : 'BANK_TRANSFER',
        recipient_account: s.payout_account, recipient_bank_code: s.payout_bank_code, recipient_name: s.payout_account_name || s.name,
    }).select('*').single();
    if (error || !reqRow) throw new PurchasingError(error?.message ?? 'Could not raise the payment request.', 500);
    const { error: li } = await supabase.from('line_items').insert({
        requisition_id: reqRow.id, description: label, quantity: 1, unit_price: amount, estimated_amount: amount, account_id: ap,
        payment_method: lineMethod, recipient_account: s.payout_account, recipient_bank_code: s.payout_bank_code, is_valid: true,
    });
    if (li) { await supabase.from('requisitions').delete().eq('id', reqRow.id); throw new PurchasingError(li.message, 500); }
    await supabase.from('purchase_bills').update({ requisition_id: reqRow.id, updated_at: new Date().toISOString() }).eq('id', billId);

    // Same notices as any new requisition; a failure to send them never undoes the request.
    try {
        const [{ RequisitionMessageService }, { emailService }, { pushService }] = await Promise.all([
            import('./requisition_message.service'), import('./email.service'), import('./push.service'),
        ]);
        await RequisitionMessageService.createMessage({ requisitionId: reqRow.id, userId, content: 'Requisition submitted for approval', type: 'SYSTEM', metadata: { stage: 'APPROVAL' } });
        emailService.notifyRequisitionEvent(reqRow.id, 'NEW_REQUISITION').catch(() => undefined);
        pushService.notifyRequisitionEvent(reqRow.id, 'NEW_REQUISITION').catch(() => undefined);
    } catch (e) { console.error('[Purchasing] could not send the requisition notices:', (e as Error).message); }
    return { requisitionId: reqRow.id, amount };
}

/**
 * Marks a bill paid once its wallet payment has gone out, and frees the bill for another try if the request was turned down.
 * The money's journal entry comes from the payout itself (Dr Accounts Payable, Cr wallet), so none is posted here.
 */
export async function syncWalletPayments(orgId: string) {
    const { data: bills } = await supabase.from('purchase_bills').select('id, total, amount_paid, requisition_id').eq('organization_id', orgId).in('status', ['OPEN', 'PARTIAL']).not('requisition_id', 'is', null).range(0, 999);
    if (!bills?.length) return;
    const { data: reqs } = await supabase.from('requisitions').select('id, status, estimated_total, reference_number, updated_at').in('id', bills.map((b: any) => b.requisition_id));
    const by = new Map<string, any>((reqs ?? []).map((r: any) => [r.id, r]));
    for (const b of bills as any[]) {
        const r = by.get(b.requisition_id);
        if (!r) { await supabase.from('purchase_bills').update({ requisition_id: null }).eq('id', b.id); continue; }
        if (DEAD_STATES.includes(String(r.status))) { await supabase.from('purchase_bills').update({ requisition_id: null }).eq('id', b.id); continue; }
        if (!PAID_STATES.includes(String(r.status))) continue;
        const amount = r2(Number(r.estimated_total));
        const { error } = await supabase.from('bill_payments').insert({ organization_id: orgId, bill_id: b.id, amount, paid_on: String(r.updated_at ?? '').slice(0, 10) || today(), method: 'MoneyWise wallet', reference: r.reference_number ?? null, requisition_id: r.id });
        if (error) continue; // already recorded (unique on the requisition)
        const paid = r2(Number(b.amount_paid) + amount);
        await supabase.from('purchase_bills').update({ amount_paid: paid, status: paid >= Number(b.total) - 0.001 ? 'PAID' : 'PARTIAL', requisition_id: null, updated_at: new Date().toISOString() }).eq('id', b.id);
    }
}

// ---------- sales ----------

/**
 * A sale takes stock out and, where the cost is known, moves its cost out of Inventory into Cost of Goods Sold (Dr COGS, Cr Inventory).
 * Safe to call twice for the same order. Stock itself was already taken when the order was placed; this records the history and the cost.
 */
export async function recordSale(order: { id: string; seller_org_id: string; product_id: string; variant_id?: string | null; quantity: number }) {
    try {
        const orgId = order.seller_org_id;
        const { data: done } = await supabase.from('stock_movements').select('id').eq('organization_id', orgId).eq('ref_type', 'MARKETPLACE_ORDER').eq('ref_id', order.id).eq('reason', 'SALE').maybeSingle();
        if (done) return;
        const { data: p } = await supabase.from('products').select('id, track_stock, stock_quantity, variants, cost_price').eq('id', order.product_id).maybeSingle();
        if (!p || !p.track_stock) return;
        const cost = Number(p.cost_price) || 0;
        const { error } = await supabase.from('stock_movements').insert({
            organization_id: orgId, product_id: p.id, variant_id: order.variant_id ?? null, quantity_change: -order.quantity, unit_cost: cost || null, reason: 'SALE',
            ref_type: 'MARKETPLACE_ORDER', ref_id: order.id, balance_after: stockOf(p, order.variant_id), note: 'Marketplace order',
        });
        if (error) return;
        const value = r2(order.quantity * cost);
        if (value > 0) {
            const inv = await inventoryAcct(orgId);
            const cogs = await ensureAccount(orgId, 'COGS', 'Cost of goods sold', 'EXPENSE', 'Cost of Goods Sold');
            await postJournal(orgId, null, today(), 'Cost of goods sold', `COGS-${order.id.slice(0, 8)}`, 'STOCK_SALE', order.id, [
                { accountId: cogs, debit: value, credit: 0 }, { accountId: inv, debit: 0, credit: value },
            ]);
        }
    } catch (e) { console.error('[Purchasing] could not record the sale against stock:', (e as Error).message); }
}

// ---------- stock ----------

export async function adjustStock(orgId: string, userId: string, body: any) {
    const { data: p } = await supabase.from('products').select('id, name, track_stock, stock_quantity, variants, cost_price').eq('organization_id', orgId).eq('id', String(body?.productId ?? '')).maybeSingle();
    if (!p) throw new PurchasingError('Product not found.', 404);
    if (!p.track_stock) throw new PurchasingError('Turn on stock tracking for this product first.');
    const variantId: string | null = variantsOf(p).length ? String(body?.variantId ?? '') : null;
    if (variantsOf(p).length && !variantsOf(p).some((v) => v.id === variantId)) throw new PurchasingError('Choose which option (colour or size) to adjust.');
    const before = stockOf(p, variantId);
    const counted = body?.countedQuantity != null && body.countedQuantity !== '' ? Math.floor(Number(body.countedQuantity)) : null;
    const change = counted != null ? counted - before : Math.floor(Number(body?.change));
    if (!Number.isFinite(change) || change === 0) throw new PurchasingError('Nothing to change: enter the counted quantity, or how many to add or remove.');
    const after = before + change;
    if (after < 0) throw new PurchasingError(`Only ${before} in stock, so ${Math.abs(change)} can’t be removed.`);
    const reason = counted != null ? 'COUNT' : 'ADJUSTMENT';
    const cost = Number(p.cost_price) || 0;

    await applyStock(p, variantId, change);
    const { data: mv, error } = await supabase.from('stock_movements').insert({ organization_id: orgId, product_id: p.id, variant_id: variantId, quantity_change: change, unit_cost: cost || null, reason, note: text(body?.note, 300), balance_after: after, created_by: userId }).select('*').single();
    if (error || !mv) throw new PurchasingError(error?.message ?? 'Could not record the movement.', 500);
    const value = r2(Math.abs(change) * cost);
    if (value > 0) {
        try {
            const inv = await inventoryAcct(orgId), adj = await adjustmentAcct(orgId);
            await postJournal(orgId, userId, today(), `Stock ${change < 0 ? 'write-off' : 'gain'}: ${p.name}`, `STK-${mv.id.slice(0, 8)}`, 'STOCK_ADJUSTMENT', mv.id,
                change < 0 ? [{ accountId: adj, debit: value, credit: 0 }, { accountId: inv, debit: 0, credit: value }] : [{ accountId: inv, debit: value, credit: 0 }, { accountId: adj, debit: 0, credit: value }]);
        } catch (e) { console.error('[Purchasing] stock adjustment not posted to the ledger:', (e as Error).message); }
    }
    return { ...mv, productName: p.name, valuePosted: value };
}

export async function stockMovements(orgId: string, productId?: string) {
    let q = supabase.from('stock_movements').select('*, products(name)').eq('organization_id', orgId).order('created_at', { ascending: false }).range(0, 499);
    if (productId) q = q.eq('product_id', productId);
    const { data, error } = await q;
    if (error) throw new PurchasingError(error.message, 500);
    return data ?? [];
}

export async function inventoryValuation(orgId: string) {
    const { data, error } = await supabase.from('products').select('id, name, stock_quantity, cost_price, low_stock_threshold, variants').eq('organization_id', orgId).eq('track_stock', true).order('name').range(0, 4999);
    if (error) throw new PurchasingError(error.message, 500);
    const rows = (data ?? []).map((p: any) => {
        const qty = Array.isArray(p.variants) && p.variants.length ? p.variants.reduce((s: number, v: any) => s + (Number(v.stock) || 0), 0) : Math.max(0, Number(p.stock_quantity) || 0);
        const cost = Number(p.cost_price) || 0;
        return { productId: p.id, name: p.name, quantity: qty, unitCost: cost, value: r2(qty * cost), low: qty <= (Number(p.low_stock_threshold) || 0), costKnown: cost > 0, variants: variantsOf(p).map((v) => ({ id: v.id, name: v.name, stock: Number(v.stock) || 0 })) };
    });
    const { data: inv } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', 'INVENTORY').maybeSingle();
    let ledger: number | null = null;
    if (inv) {
        const { data: b } = await supabase.rpc('accounting_balances', { p_org: orgId, p_from: null, p_to: null });
        const row = ((b ?? []) as any[]).find((x) => x.account_id === inv.id);
        ledger = row ? r2(Number(row.debit) - Number(row.credit)) : 0;
    }
    return { rows, totalValue: r2(rows.reduce((s, r) => s + r.value, 0)), withoutCost: rows.filter((r) => !r.costKnown && r.quantity > 0).length, ledgerInventory: ledger };
}

/** What is owed to suppliers, by how late it is. */
export async function payablesAgeing(orgId: string) {
    await syncWalletPayments(orgId).catch(() => undefined);
    const { data } = await supabase.from('purchase_bills').select('supplier_id, total, amount_paid, due_date, suppliers(name)').eq('organization_id', orgId).in('status', ['OPEN', 'PARTIAL']).range(0, 49999);
    const now = Date.parse(today());
    const buckets = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const;
    const by = new Map<string, any>();
    for (const b of (data ?? []) as any[]) {
        const open = r2(Number(b.total) - Number(b.amount_paid)); if (open <= 0) continue;
        const late = Math.floor((now - Date.parse(b.due_date)) / 86_400_000);
        const k = late <= 0 ? 'current' : late <= 30 ? 'd1_30' : late <= 60 ? 'd31_60' : late <= 90 ? 'd61_90' : 'd90_plus';
        const x = by.get(b.supplier_id) ?? { supplierId: b.supplier_id, supplier: b.suppliers?.name ?? 'Supplier', current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
        x[k] = r2(x[k] + open); x.total = r2(x.total + open); by.set(b.supplier_id, x);
    }
    const rows = [...by.values()].sort((a, b) => b.total - a.total);
    const totals: Record<string, number> = { total: 0 }; for (const k of buckets) totals[k] = 0;
    for (const r of rows) { for (const k of buckets) totals[k] = r2(totals[k] + r[k]); totals.total = r2(totals.total + r.total); }
    return { rows, totals };
}

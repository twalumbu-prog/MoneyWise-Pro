import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';

/**
 * VAT for a business that is registered for it. Enterprise plan; the route enforces that.
 *
 *  - Sales: an invoice's prices are taken as VAT-inclusive, so its total doesn't change; the VAT inside it is moved out of income into VAT Payable.
 *  - Purchases: a supplier bill's VAT is not part of the cost; it is held in VAT Recoverable until it is claimed back in the return.
 *  - Every VAT amount is also written to vat_transactions, which the return is built from. The ledger's two VAT accounts move with it, so
 *    the return can be checked against the books.
 *  - Sales and purchases that were not entered as invoices or bills (cash sales, direct payments) are brought in with a VAT adjustment.
 * The rate and the due date come from settings and from the 18th-of-the-following-month rule; confirm both against ZRA for your business.
 */

export class VatError extends Error { constructor(message: string, readonly httpStatus = 400) { super(message); } }

export type TaxCode = 'STANDARD' | 'ZERO' | 'EXEMPT';
export interface VatSettings { registered: boolean; rate: number; tpin: string | null; vatNumber: string | null }

const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isTaxCode = (v: unknown): v is TaxCode => v === 'STANDARD' || v === 'ZERO' || v === 'EXEMPT';

export async function getSettings(orgId: string): Promise<VatSettings> {
    const { data } = await supabase.from('accounting_settings').select('vat_registered, vat_rate, tpin, vat_number').eq('organization_id', orgId).maybeSingle();
    return { registered: !!data?.vat_registered, rate: Number(data?.vat_rate ?? 16), tpin: data?.tpin ?? null, vatNumber: data?.vat_number ?? null };
}

export async function saveSettings(orgId: string, userId: string, body: any): Promise<VatSettings> {
    const rate = Number(body?.rate);
    if (!(rate >= 0 && rate <= 30)) throw new VatError('Enter the VAT rate as a percentage, for example 16.');
    const text = (v: unknown) => String(v ?? '').trim().slice(0, 40) || null;
    const row = { organization_id: orgId, vat_registered: !!body?.registered, vat_rate: r2(rate), tpin: text(body?.tpin), vat_number: text(body?.vatNumber), updated_by: userId, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('accounting_settings').upsert(row, { onConflict: 'organization_id' });
    if (error) throw new VatError(error.message, 500);
    return getSettings(orgId);
}

async function ensureAccount(orgId: string, code: string, name: string, type: string, subtype: string): Promise<string> {
    const { data } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', code).maybeSingle();
    if (data) return data.id;
    const { data: made, error } = await supabase.from('accounts').insert({ organization_id: orgId, code, name, type, subtype, is_active: true, description: 'Created for VAT' }).select('id').single();
    if (error || !made) {
        const { data: again } = await supabase.from('accounts').select('id').eq('organization_id', orgId).eq('code', code).maybeSingle();
        if (again) return again.id;
        throw new VatError(`Could not set up the ${name} account.`, 500);
    }
    return made.id;
}
export const vatPayableAccount = (o: string) => ensureAccount(o, 'VAT-PAYABLE', 'VAT payable', 'LIABILITY', 'Other Current Liabilities');
export const vatInputAccount = (o: string) => ensureAccount(o, 'VAT-INPUT', 'VAT recoverable', 'ASSET', 'Other Current Assets');

/** Splits an amount into net and VAT. `inclusive` means the amount already has VAT in it. */
export function split(amount: number, code: TaxCode, rate: number, inclusive: boolean) {
    const gross = r2(amount);
    if (code !== 'STANDARD') return { net: gross, vat: 0, gross };
    if (inclusive) { const vat = r2((gross * rate) / (100 + rate)); return { net: r2(gross - vat), vat, gross }; }
    const vat = r2((gross * rate) / 100);
    return { net: gross, vat, gross: r2(gross + vat) };
}

interface TxIn { direction: 'OUTPUT' | 'INPUT'; code: TaxCode; date: string; net: number; vat: number; sourceType: string; sourceId: string; counterparty?: string | null; reference?: string | null; note?: string | null }

export async function recordTransactions(orgId: string, rows: TxIn[]) {
    if (!rows.length) return;
    const { error } = await supabase.from('vat_transactions').insert(rows.map((r) => ({
        organization_id: orgId, direction: r.direction, tax_code: r.code, tx_date: r.date, net: r.net, vat: r.vat,
        source_type: r.sourceType, source_id: r.sourceId, counterparty: r.counterparty ?? null, reference: r.reference ?? null, note: r.note ?? null,
    })));
    if (error) console.error('[VAT] could not record the VAT amounts:', error.message);
}

export async function removeTransactions(orgId: string, sourceType: string, sourceId: string) {
    await supabase.from('vat_transactions').delete().eq('organization_id', orgId).eq('source_type', sourceType).eq('source_id', sourceId);
}

/** Groups an invoice's lines by tax code and records them as output VAT. Safe to call again for the same invoice. */
export async function recordInvoiceVat(invoice: any) {
    await removeTransactions(invoice.organization_id, 'INVOICE', invoice.id);
    if (invoice.status === 'VOID') return;
    const by = new Map<TaxCode, { net: number; vat: number }>();
    for (const it of (invoice.items ?? []) as any[]) {
        if (!it.tax_code) continue;
        const x = by.get(it.tax_code) ?? { net: 0, vat: 0 };
        x.net = r2(x.net + Number(it.net ?? 0)); x.vat = r2(x.vat + Number(it.vat ?? 0)); by.set(it.tax_code, x);
    }
    await recordTransactions(invoice.organization_id, [...by].map(([code, v]) => ({ direction: 'OUTPUT' as const, code, date: invoice.issue_date, net: v.net, vat: v.vat, sourceType: 'INVOICE', sourceId: invoice.id, counterparty: invoice.customer_name, reference: invoice.invoice_number })));
}

// ---------- the return ----------

/** The 18th of the month after the period ends. */
export const dueDate = (periodEnd: string) => { const d = new Date(periodEnd + 'T00:00:00Z'); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 18)).toISOString().slice(0, 10); };

export async function vatReturn(orgId: string, from: string, to: string) {
    const [settings, { data: tx, error }, { data: filed }] = await Promise.all([
        getSettings(orgId),
        supabase.from('vat_transactions').select('*').eq('organization_id', orgId).gte('tx_date', from).lte('tx_date', to).order('tx_date').range(0, 19999),
        supabase.from('vat_returns').select('*').eq('organization_id', orgId).eq('period_start', from).eq('period_end', to).maybeSingle(),
    ]);
    if (error) throw new VatError(`Could not read VAT records (${error.message}). Has the VAT migration been applied?`, 500);
    const sum = (dir: 'OUTPUT' | 'INPUT', code: TaxCode, f: 'net' | 'vat') => r2((tx ?? []).filter((t: any) => t.direction === dir && t.tax_code === code).reduce((s: number, t: any) => s + Number(t[f]), 0));
    const sales = { standardNet: sum('OUTPUT', 'STANDARD', 'net'), standardVat: sum('OUTPUT', 'STANDARD', 'vat'), zeroNet: sum('OUTPUT', 'ZERO', 'net'), exemptNet: sum('OUTPUT', 'EXEMPT', 'net') };
    const purchases = { standardNet: sum('INPUT', 'STANDARD', 'net'), standardVat: sum('INPUT', 'STANDARD', 'vat'), zeroNet: sum('INPUT', 'ZERO', 'net'), exemptNet: sum('INPUT', 'EXEMPT', 'net') };
    const outputVat = sales.standardVat, inputVat = purchases.standardVat;
    const net = r2(outputVat - inputVat);

    // The books' own VAT accounts over the same dates, so a difference (VAT posted by hand, for instance) is visible.
    const { data: accts } = await supabase.from('accounts').select('id, code').eq('organization_id', orgId).in('code', ['VAT-PAYABLE', 'VAT-INPUT']);
    const idOf = (c: string) => accts?.find((a: any) => a.code === c)?.id as string | undefined;
    const { data: bal } = await supabase.rpc('accounting_balances', { p_org: orgId, p_from: from, p_to: to }).range(0, 9999);
    const row = (id?: string) => ((bal ?? []) as any[]).find((b) => b.account_id === id);
    const ledgerOutput = r2(Number(row(idOf('VAT-PAYABLE'))?.credit ?? 0) - Number(row(idOf('VAT-PAYABLE'))?.debit ?? 0));
    const ledgerInput = r2(Number(row(idOf('VAT-INPUT'))?.debit ?? 0) - Number(row(idOf('VAT-INPUT'))?.credit ?? 0));

    return {
        from, to, dueBy: dueDate(to), settings, sales, purchases, outputVat, inputVat, netVat: net, position: net >= 0 ? 'PAYABLE' : 'REFUNDABLE',
        ledger: { outputVat: ledgerOutput, inputVat: ledgerInput, agrees: Math.abs(ledgerOutput - outputVat) < 0.01 && Math.abs(ledgerInput - inputVat) < 0.01 },
        transactions: tx ?? [], filed: filed ?? null,
    };
}

export async function fileReturn(orgId: string, userId: string, from: string, to: string, paymentReference?: string) {
    const snapshot = await vatReturn(orgId, from, to);
    if (snapshot.filed) throw new VatError('A return for this period has already been recorded as filed.', 409);
    const { transactions, filed, ...totals } = snapshot as any;
    const { data, error } = await supabase.from('vat_returns').insert({ organization_id: orgId, period_start: from, period_end: to, totals: { ...totals, transactionCount: transactions.length }, payment_reference: String(paymentReference ?? '').trim().slice(0, 80) || null, filed_by: userId }).select('*').single();
    if (error) throw new VatError(error.message, 500);
    await supabase.from('audit_logs').insert({ entity_type: 'VAT_RETURN', entity_id: data.id, action: 'FILED', user_id: userId, changes: { from, to, netVat: totals.netVat } }).then(() => undefined, () => undefined);
    return data;
}

export async function listReturns(orgId: string) {
    const { data } = await supabase.from('vat_returns').select('id, period_start, period_end, totals, payment_reference, filed_at').eq('organization_id', orgId).order('period_end', { ascending: false }).limit(60);
    return data ?? [];
}

/**
 * Brings VAT in for money that never went through an invoice or a bill: cash sales already booked at their full price, or costs paid directly.
 * Sales: the VAT inside the amount moves out of the income account into VAT Payable. Purchases: it moves from the expense account into VAT recoverable.
 */
export async function addAdjustment(orgId: string, userId: string, body: any) {
    const s = await getSettings(orgId);
    if (!s.registered) throw new VatError('Switch on VAT registration first.');
    const direction = body?.direction === 'INPUT' ? 'INPUT' : 'OUTPUT';
    const code: TaxCode = isTaxCode(body?.taxCode) ? body.taxCode : 'STANDARD';
    const date = isDate(body?.date) ? body.date : today();
    const gross = r2(Number(body?.gross));
    if (!(gross > 0)) throw new VatError('Enter the full amount, including VAT.');
    const { data: acct } = await supabase.from('accounts').select('id, type').eq('organization_id', orgId).eq('id', String(body?.accountId ?? '')).maybeSingle();
    if (!acct || acct.type !== (direction === 'OUTPUT' ? 'INCOME' : 'EXPENSE')) throw new VatError(direction === 'OUTPUT' ? 'Choose the income account those sales were recorded in.' : 'Choose the expense account those costs were recorded in.');
    const { net, vat } = split(gross, code, s.rate, true);
    const id = randomUUID();
    const note = String(body?.note ?? '').trim().slice(0, 200) || null;
    if (vat > 0) {
        const vatAcct = direction === 'OUTPUT' ? await vatPayableAccount(orgId) : await vatInputAccount(orgId);
        const { data: je, error } = await supabase.from('journal_entries').insert({
            organization_id: orgId, entry_date: date, description: `VAT on ${direction === 'OUTPUT' ? 'sales' : 'purchases'}${note ? `: ${note}` : ''}`, reference_number: `VAT-${id.slice(0, 8)}`, source_type: 'MANUAL', source_id: id, created_by: userId,
        }).select('id').single();
        if (error || !je) throw new VatError(`Could not post to the ledger: ${error?.message}`, 500);
        const lines = direction === 'OUTPUT' ? [{ account_id: acct.id, debit: vat, credit: 0 }, { account_id: vatAcct, debit: 0, credit: vat }] : [{ account_id: vatAcct, debit: vat, credit: 0 }, { account_id: acct.id, debit: 0, credit: vat }];
        const { error: le } = await supabase.from('journal_lines').insert(lines.map((l) => ({ journal_entry_id: je.id, ...l })));
        if (le) { await supabase.from('journal_entries').delete().eq('id', je.id); throw new VatError(le.message, 500); }
    }
    await recordTransactions(orgId, [{ direction, code, date, net, vat, sourceType: 'MANUAL', sourceId: id, counterparty: String(body?.counterparty ?? '').trim().slice(0, 120) || null, note }]);
    return { id, net, vat };
}

/**
 * depositTransfer.service.ts — a sale was paid into an external account (Airtel Money / cash / bank) and booked there,
 * and the money was then moved into the MoneyWise wallet, where it landed as an unclassified deposit. Until the two
 * are linked the money is counted twice: once in the external ledger (the sale) and once in the wallet (the deposit).
 *
 * Linking books the external-account side of a "Transfer to MoneyWise" — exactly the legs the app's own
 * POST /cashbook/transfer-to-wallet books, under the same idempotency keys (`<deposit reference>-CASHOUT` / `-FEE`):
 *   1. ADJUSTMENT credit of the NET on the external account (Dr Suspense / Cr the external asset). Suspense is where
 *      the wallet deposit's own journal credits (Dr wallet / Cr Suspense), so the two cancel to nil.
 *   2. EXPENSE credit of the collection fee (gross − net) on the external account, posted to a charges account
 *      (Dr Transaction Charges / Cr the external asset).
 * The external account therefore drops by the full sale amount, the wallet keeps the net it received, revenue stays
 * at the sale amount, and the fee shows as an expense. The deposit row itself is left exactly as it is.
 *
 * Race-safe: an api_transfers row is claimed (unique per deposit and per sale) before anything is booked.
 */
import { supabase } from '../lib/supabase';
import { cashbookService } from './cashbook.service';
import { planDepositTransfer, receiptNumberOf, cashOutReference, feeReference, resolveFeeAccount, TRANSFER_SOURCE_LABELS, ExpenseAccount } from './depositTransferRules';

export class DepositTransferError extends Error {
    constructor(message: string, public httpStatus = 400) { super(message); }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE_CLAIM_MS = 2 * 60_000;
const EXTERNAL_TYPES = ['CASH', 'AIRTEL_MONEY', 'BANK'];
const COLUMNS = 'id, organization_id, deposit_entry_id, sale_external_reference, source_account_type, status, gross_amount, net_amount, fee_amount, transfer_date, entry_ids, created_at';

export interface LinkDepositInput {
    organizationId: string;
    saleExternalReference: string;
    /** One of these names the wallet deposit. A bare receipt number matches the deposit whose description is that number. */
    depositId?: string | null;
    depositReference?: string | null;
    receiptNumber?: string | null;
    /** Expense account (id / code / name) the collection fee posts to; defaults to the org's transaction-charges account. */
    feeAccount?: string | null;
    caller?: { apiKeyId?: string | null; oauthGrantId?: string | null };
    /** Work out and return what would be booked, writing nothing. */
    dryRun?: boolean;
}

export interface DepositTransferView {
    id: string | null;
    sale_external_reference: string;
    sale_receipt_number: string | null;
    deposit: { id: string; reference_number: string | null; date: string; amount: number };
    source_account_type: string;
    date: string;
    gross_amount: number;
    net_amount: number;
    fee_amount: number;
    entry_ids: string[];
}

export interface LinkDepositResult { created: boolean; dryRun: boolean; transfer: DepositTransferView; planned?: Array<{ kind: string; account_type: string; credit: number; account: string | null; description: string; external_reference: string }> }

const num = (v: any) => Number(v ?? 0);

async function findDeposit(input: LinkDepositInput): Promise<any> {
    const orgId = input.organizationId;
    const cols = 'id, organization_id, date, entry_type, account_type, status, debit, credit, account_id, reference_number, external_reference, description';
    let rows: any[] = [];
    if (input.depositId) {
        if (!UUID_RE.test(input.depositId)) throw new DepositTransferError('`deposit_id` must be a UUID');
        const { data, error } = await supabase.from('cashbook_entries').select(cols).eq('organization_id', orgId).eq('id', input.depositId);
        if (error) throw error;
        rows = data ?? [];
    } else if (input.depositReference) {
        const ref = input.depositReference.trim();
        const { data, error } = await supabase.from('cashbook_entries').select(cols).eq('organization_id', orgId).or(`reference_number.eq.${ref.replace(/[,()]/g, '')},external_reference.eq.${ref.replace(/[,()]/g, '')}`);
        if (error) throw error;
        rows = data ?? [];
    } else if (input.receiptNumber) {
        const want = receiptNumberOf(input.receiptNumber);
        if (!want) throw new DepositTransferError('`receipt_number` must be the receipt number, e.g. "173"');
        // Wallet deposits typed with the receipt number as their narration.
        const { data, error } = await supabase.from('cashbook_entries').select(cols).eq('organization_id', orgId)
            .eq('account_type', 'MONEYWISE_WALLET').eq('entry_type', 'INFLOW').is('account_id', null).neq('status', 'PENDING').ilike('description', `%${want}%`);
        if (error) throw error;
        rows = (data ?? []).filter((r: any) => receiptNumberOf(String(r.description ?? '').split(' | Ref:')[0]) === want);
        if (rows.length > 1) throw new DepositTransferError(`More than one wallet deposit is described as receipt ${want}; name the deposit with \`deposit_reference\``, 409);
        if (rows.length === 0) throw new DepositTransferError(`No unclassified wallet deposit described as receipt ${want} was found (it may not have arrived yet)`, 404);
    } else {
        throw new DepositTransferError('Name the deposit with `deposit_id`, `deposit_reference` or `receipt_number`');
    }
    const dep = rows.find(r => r.account_type === 'MONEYWISE_WALLET' && r.entry_type === 'INFLOW');
    if (!dep) throw new DepositTransferError('Wallet deposit not found', 404);
    if (dep.status === 'PENDING') throw new DepositTransferError('That deposit has not completed yet', 409);
    if (dep.account_id) throw new DepositTransferError('That deposit is already classified to an account, so it cannot also be a transfer', 409);
    return dep;
}

async function loadSale(orgId: string, ref: string) {
    const { data: sale, error } = await supabase.from('api_sales').select('id, external_reference, status, amount, account_type, receipt_number, entry_ids, sale_date')
        .eq('organization_id', orgId).eq('external_reference', ref).maybeSingle();
    if (error) throw error;
    if (!sale || sale.status !== 'COMPLETED') throw new DepositTransferError('Sale not found', 404);
    const { data: entries, error: eErr } = await supabase.from('cashbook_entries').select('id, account_type, debit, date, reference_number').eq('organization_id', orgId).in('id', sale.entry_ids ?? []);
    if (eErr) throw eErr;
    if (!entries?.length) throw new DepositTransferError('The sale has no ledger entries to transfer from', 409);
    // The ledger the money sits in NOW (a sale can be moved between ledgers after it was posted).
    const types = [...new Set(entries.map((e: any) => e.account_type))];
    if (types.length !== 1 || !EXTERNAL_TYPES.includes(types[0] as string)) throw new DepositTransferError(`The sale is booked on ${types.join(', ')}; only cash, mobile money or bank sales can be transferred to the wallet`, 409);
    return { sale, sourceType: types[0] as string, gross: entries.reduce((s: number, e: any) => s + num(e.debit), 0) };
}

const view = (row: any, extra: { saleReceipt: string | null; deposit: any }): DepositTransferView => ({
    id: row.id ?? null,
    sale_external_reference: row.sale_external_reference,
    sale_receipt_number: extra.saleReceipt,
    deposit: { id: extra.deposit.id, reference_number: extra.deposit.reference_number ?? null, date: extra.deposit.date, amount: num(extra.deposit.debit) },
    source_account_type: row.source_account_type,
    date: row.transfer_date,
    gross_amount: num(row.gross_amount),
    net_amount: num(row.net_amount),
    fee_amount: num(row.fee_amount),
    entry_ids: row.entry_ids ?? [],
});

/** The legs already booked for this deposit (by this service or by the app's own transfer-to-wallet). */
async function bookedLegs(orgId: string, depositRef: string) {
    const { data, error } = await supabase.from('cashbook_entries').select('id, entry_type, credit, date, account_type, external_reference')
        .eq('organization_id', orgId).in('external_reference', [cashOutReference(depositRef), feeReference(depositRef)]);
    if (error) throw error;
    return data ?? [];
}

export async function linkDepositTransfer(input: LinkDepositInput): Promise<LinkDepositResult> {
    const orgId = input.organizationId;
    const { sale, sourceType, gross } = await loadSale(orgId, input.saleExternalReference);
    const deposit = await findDeposit(input);
    const depositRef: string = deposit.external_reference || deposit.reference_number || deposit.id;
    const saleReceipt: string | null = sale.receipt_number ?? null;
    const receiptNo = /:r(\d+)$/i.exec(sale.external_reference)?.[1] ?? null;
    const done = (row: any, created: boolean): LinkDepositResult => ({ created, dryRun: false, transfer: view(row, { saleReceipt, deposit }) });

    // Already linked? Same pair → answer with it; a different pair → conflict.
    const { data: prior, error: priorErr } = await supabase.from('api_transfers').select(COLUMNS).eq('organization_id', orgId)
        .or(`deposit_entry_id.eq.${deposit.id},sale_external_reference.eq.${input.saleExternalReference.replace(/[,()]/g, '')}`);
    // A dry run may happen before the api_transfers migration is applied: nothing can be linked yet, so there is nothing prior.
    if (priorErr && !(input.dryRun && (priorErr as any).code === '42P01' || /api_transfers/.test(priorErr.message ?? '') && input.dryRun)) throw priorErr;
    let owned: any = null; // a dead request's claim this one takes over
    for (const p of prior ?? []) {
        if (p.deposit_entry_id !== deposit.id || p.sale_external_reference !== input.saleExternalReference) {
            throw new DepositTransferError(p.deposit_entry_id === deposit.id
                ? `That deposit is already transferred for sale ${p.sale_external_reference}`
                : `That sale is already transferred from deposit ${p.deposit_entry_id}`, 409);
        }
        if (p.status === 'COMPLETED') return done(p, false);
        if (p.status === 'FAILED') throw new DepositTransferError('A previous attempt to book this transfer failed part-way and needs review in MoneyWise; nothing was booked again', 500);
        if (Date.now() - Date.parse(p.created_at) <= STALE_CLAIM_MS) throw new DepositTransferError('This transfer is still being booked by another request; retry shortly', 503);
        owned = p;
    }

    // Legs already in the ledger (booked by the app, or by a request that died before completing its claim).
    const legs = await bookedLegs(orgId, depositRef);
    if (legs.length > 0) {
        const out = legs.find((l: any) => l.external_reference === cashOutReference(depositRef));
        const fee = legs.find((l: any) => l.external_reference === feeReference(depositRef));
        const row = {
            id: owned?.id ?? null, sale_external_reference: input.saleExternalReference, source_account_type: out?.account_type ?? sourceType,
            gross_amount: num(out?.credit) + num(fee?.credit), net_amount: num(out?.credit), fee_amount: num(fee?.credit),
            transfer_date: out?.date ?? deposit.date, entry_ids: legs.map((l: any) => l.id),
        };
        if (!input.dryRun) {
            if (owned) await supabase.from('api_transfers').update({ status: 'COMPLETED', gross_amount: row.gross_amount, net_amount: row.net_amount, fee_amount: row.fee_amount, transfer_date: row.transfer_date, entry_ids: row.entry_ids, completed_at: new Date().toISOString() }).eq('id', owned.id);
            else {
                const ins = await supabase.from('api_transfers').insert({ organization_id: orgId, deposit_entry_id: deposit.id, sale_external_reference: input.saleExternalReference, source_account_type: row.source_account_type, status: 'COMPLETED', gross_amount: row.gross_amount, net_amount: row.net_amount, fee_amount: row.fee_amount, transfer_date: row.transfer_date, entry_ids: row.entry_ids, completed_at: new Date().toISOString(), ...(input.caller?.apiKeyId ? { api_key_id: input.caller.apiKeyId } : {}), ...(input.caller?.oauthGrantId ? { oauth_grant_id: input.caller.oauthGrantId } : {}) }).select('id').maybeSingle();
                row.id = ins.data?.id ?? null;
            }
        }
        return { ...done(row, false), dryRun: !!input.dryRun };
    }

    const planned = planDepositTransfer(gross, num(deposit.debit));
    if (!planned.ok) throw new DepositTransferError(planned.error, 409);
    const { net, fee } = planned.plan;

    let feeAcct: ExpenseAccount | null = null;
    if (fee > 0) {
        const { data: accts, error } = await supabase.from('accounts').select('id, code, name, is_active').eq('organization_id', orgId).eq('type', 'EXPENSE');
        if (error) throw error;
        feeAcct = resolveFeeAccount((accts ?? []) as ExpenseAccount[], input.feeAccount ?? null);
        if (input.feeAccount && !feeAcct) throw new DepositTransferError(`Fee account "${input.feeAccount}" was not found among your expense accounts`);
    }

    const srcLabel = TRANSFER_SOURCE_LABELS[sourceType] ?? sourceType;
    const tag = `${receiptNo ? `Receipt #${receiptNo} | ` : ''}${saleReceipt ? `Sale ${saleReceipt} | ` : ''}Deposit ${deposit.reference_number ?? depositRef}`;
    const legsPlan = [
        { kind: 'transfer', account_type: sourceType, credit: net, account: null as string | null, description: `Transfer to MoneyWise: ${srcLabel} ➡️ MoneyWise Wallet (Outflow) | ${tag}`, external_reference: cashOutReference(depositRef) },
        ...(fee > 0 ? [{ kind: 'fee', account_type: sourceType, credit: fee, account: feeAcct?.name ?? null, description: `Collection fee — ${srcLabel} ➡️ MoneyWise Wallet | ${tag}`, external_reference: feeReference(depositRef) }] : []),
    ];
    const baseRow = { sale_external_reference: input.saleExternalReference, source_account_type: sourceType, gross_amount: gross, net_amount: net, fee_amount: fee, transfer_date: deposit.date, entry_ids: [] as string[] };
    if (input.dryRun) return { created: false, dryRun: true, transfer: view({ id: null, ...baseRow }, { saleReceipt, deposit }), planned: legsPlan };

    // Claim, so only one request can ever book this deposit.
    let claimId: string = owned?.id ?? '';
    if (!owned) {
        const { data: claim, error: claimErr } = await supabase.from('api_transfers').insert({
            organization_id: orgId, deposit_entry_id: deposit.id, sale_external_reference: input.saleExternalReference, source_account_type: sourceType, status: 'PENDING',
            ...(input.caller?.apiKeyId ? { api_key_id: input.caller.apiKeyId } : {}), ...(input.caller?.oauthGrantId ? { oauth_grant_id: input.caller.oauthGrantId } : {}),
        }).select('id').single();
        if (claimErr) {
            if (claimErr.code === '23505') throw new DepositTransferError('This transfer is being booked by another request; retry shortly', 503);
            throw claimErr;
        }
        claimId = claim.id;
    }

    const entryIds: string[] = [];
    try {
        for (const leg of legsPlan) {
            const isFee = leg.kind === 'fee';
            const entry = await cashbookService.createEntry(orgId, {
                entry_type: isFee ? 'EXPENSE' : 'ADJUSTMENT',
                description: leg.description,
                debit: 0,
                credit: leg.credit,
                date: deposit.date,
                account_type: sourceType,
                account_id: isFee ? (feeAcct?.id ?? null) : null,
                status: isFee && feeAcct ? 'ACCOUNTED' : 'COMPLETED',
                external_reference: leg.external_reference,
            } as any);
            entryIds.push(entry.id as string);
        }
    } catch (err: any) {
        if (entryIds.length === 0) await supabase.from('api_transfers').delete().eq('id', claimId);
        else await supabase.from('api_transfers').update({ status: 'FAILED', error: String(err?.message ?? err).slice(0, 500), entry_ids: entryIds }).eq('id', claimId);
        throw err;
    }

    const row = { id: claimId, ...baseRow, entry_ids: entryIds };
    const { error: doneErr } = await supabase.from('api_transfers').update({ status: 'COMPLETED', entry_ids: entryIds, completed_at: new Date().toISOString() }).eq('id', claimId);
    if (doneErr) console.error('[DepositTransfer] Failed to complete claim', claimId, doneErr.message);
    return done(row, true);
}

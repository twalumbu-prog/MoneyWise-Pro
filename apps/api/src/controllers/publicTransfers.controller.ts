/**
 * Public API v1 — POST /v1/transfers: link a sale (recorded with POST /v1/sales) to the wallet deposit that moved its
 * money, so the external-account sale and the wallet deposit cancel out instead of counting twice. Books through
 * services/depositTransfer.service.ts. Idempotent per deposit and per sale.
 */
import { supabase } from '../lib/supabase';
import { linkDepositTransfer, DepositTransferError } from '../services/depositTransfer.service';
import { fail } from './publicApiShared';

const callerOf = (userId: string) => ({
    apiKeyId: userId.startsWith('api-key:') ? userId.slice('api-key:'.length) : null,
    oauthGrantId: userId.startsWith('oauth:') ? userId.slice('oauth:'.length) : null,
});

const str = (v: unknown, max: number): string | null | undefined => {
    if (v === undefined || v === null || v === '') return null;
    return typeof v === 'string' && v.trim().length <= max ? v.trim() : undefined;
};

export const createTransfer = async (req: any, res: any) => {
    const b = req.body ?? {};
    const sale = str(b.sale_external_reference, 120);
    if (!sale) return fail(res, 400, '`sale_external_reference` (1–120 characters) is required');
    const depositId = str(b.deposit_id, 64), depositRef = str(b.deposit_reference, 120), receipt = str(b.receipt_number, 20), feeAcct = str(b.fee_account, 200);
    if ([depositId, depositRef, receipt, feeAcct].some(v => v === undefined)) return fail(res, 400, '`deposit_id`, `deposit_reference`, `receipt_number` and `fee_account` must be short strings');
    if (!depositId && !depositRef && !receipt) return fail(res, 400, 'Name the wallet deposit with `deposit_id`, `deposit_reference` (e.g. "CR-2026-0068") or `receipt_number` (e.g. "173")');
    if (b.dry_run !== undefined && typeof b.dry_run !== 'boolean') return fail(res, 400, '`dry_run` must be true or false');

    try {
        const result = await linkDepositTransfer({
            organizationId: req.user.organization_id,
            saleExternalReference: sale,
            depositId, depositReference: depositRef, receiptNumber: receipt, feeAccount: feeAcct,
            caller: callerOf(String(req.user.id)),
            dryRun: b.dry_run === true,
        });
        if (result.dryRun) {
            return res.status(200).json({ data: result.transfer, planned_entries: result.planned ?? [], created: false, dry_run: true });
        }
        return res.status(result.created ? 201 : 200).json({ data: result.transfer, created: result.created });
    } catch (err: any) {
        if (err instanceof DepositTransferError) {
            if (err.httpStatus === 503) res.set('Retry-After', '5');
            return fail(res, err.httpStatus, err.message);
        }
        return fail(res, 500, 'Failed to record transfer', err);
    }
};

/** GET /v1/transfers?sale_external_reference=… — the transfer recorded for a sale. */
export const getTransfer = async (req: any, res: any) => {
    const sale = str(req.query.sale_external_reference, 120);
    if (!sale) return fail(res, 400, '`sale_external_reference` (1–120 characters) is required');
    const { data, error } = await supabase.from('api_transfers')
        .select('id, sale_external_reference, source_account_type, gross_amount, net_amount, fee_amount, transfer_date, entry_ids, deposit_entry_id')
        .eq('organization_id', req.user.organization_id).eq('sale_external_reference', sale).eq('status', 'COMPLETED').maybeSingle();
    if (error) return fail(res, 500, 'Failed to fetch transfer', error);
    if (!data) return fail(res, 404, 'Transfer not found');
    res.json({ data: { ...data, gross_amount: Number(data.gross_amount), net_amount: Number(data.net_amount), fee_amount: Number(data.fee_amount) } });
};

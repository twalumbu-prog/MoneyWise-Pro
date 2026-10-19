/**
 * Commission sweep — forwards the MoneyWise platform commission out of a collecting sub-account into the MoneyWise
 * settlement merchant (Blue Opus Software, till 9838830) as a separate "Split payment" transfer.
 *
 * Shared by the collection webhook (the moment a public sale is confirmed) and by the Ledger Guardian (which makes
 * sure the sweep happened for EVERY public sale, including ones recovered by the sync after a missed webhook).
 *
 * Commission = gross collected − net settled (the surplus the customer paid on top of the net subtotal), so it never
 * depends on re-deriving the fee tier. Idempotent: the transfer reference is deterministic (SPLIT-<originalRef>) and a
 * transfer with that reference is never created twice.
 */
import { LencoService } from './lenco.service';
import { captureEvent } from '../utils/analytics';

export const SETTLEMENT_TILL_NUMBER = process.env.MONEYWISE_SETTLEMENT_TILL_NUMBER || '9838830';
/** Blue Opus Software is the settlement merchant itself — it never sweeps to itself. */
export const SETTLEMENT_ORG_ID = 'fa99669d-6160-44fd-94ac-8ff1f065003f';

export type SweepOutcome = 'succeeded' | 'skipped' | 'failed';

export async function sweepPlatformCommission(
    sourceAccountId: string,
    secretKey: string,
    commission: number,
    originalReference: string,
    organizationId: string
): Promise<SweepOutcome> {
    const splitRef = `SPLIT-${originalReference}`;
    let status: SweepOutcome = 'succeeded';
    try {
        // Idempotency guard — don't double-sweep if the webhook / verify poller / guardian re-fires.
        const existing = await LencoService.getTransferStatus(splitRef, secretKey);
        if (existing) {
            console.log(`[Lenco Sweep] Commission already forwarded for ${originalReference} (ref: ${splitRef}). Skipping.`);
            status = 'skipped';
            return status;
        }

        await LencoService.transferToLencoMerchant({
            amount: commission,
            reference: splitRef,
            tillNumber: SETTLEMENT_TILL_NUMBER,
            narration: 'Split payment'
        }, sourceAccountId, secretKey);

        console.log(`[Lenco Sweep] Forwarded commission K${commission.toFixed(2)} → merchant ${SETTLEMENT_TILL_NUMBER} (ref: ${splitRef}).`);
        return status;
    } catch (sweepErr: any) {
        // Never block the collection on a sweep failure — the surplus stays in the sub-account; the Ledger Guardian
        // detects it (SWEEP_MISSING) and retries.
        console.error(`[Lenco Sweep] FAILED to forward commission for ${originalReference}:`, sweepErr?.message || sweepErr);
        status = 'failed';
        return status;
    } finally {
        captureEvent('commission_sweep_attempted', {
            feature: 'commission_sweep',
            workflow_id: originalReference,
            organization_id: organizationId,
            user_id: 'system',
            status,
            amount: commission,
        });
    }
}

/**
 * Pure rules for linking a sale paid into an external account to the wallet deposit that moved the money.
 * No I/O, so they can be tested on their own (npm run test:transfers).
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The most a collection fee may be of the sale before the pair is treated as a mismatch rather than a fee. */
export const MAX_FEE_FRACTION = 0.05;

export interface TransferPlan { gross: number; net: number; fee: number }
export type PlanResult = { ok: true; plan: TransferPlan } | { ok: false; error: string };

/**
 * The sale is what the guest paid (gross); the deposit is what reached the wallet (net); the shortfall is the
 * collection fee the mobile-money operator took on the way. A deposit larger than the sale, or a shortfall bigger
 * than MAX_FEE_FRACTION of the sale, is not a fee — it is the wrong pair.
 */
export function planDepositTransfer(saleAmount: number, depositAmount: number): PlanResult {
    const gross = round2(saleAmount), net = round2(depositAmount);
    if (!(gross > 0) || !(net > 0)) return { ok: false, error: 'Sale and deposit amounts must be greater than 0' };
    const fee = round2(gross - net);
    if (fee < 0) return { ok: false, error: `The deposit (K${net.toFixed(2)}) is larger than the sale (K${gross.toFixed(2)}), so this is not the deposit for that sale` };
    if (fee > round2(gross * MAX_FEE_FRACTION)) {
        return { ok: false, error: `The deposit (K${net.toFixed(2)}) is K${fee.toFixed(2)} below the sale (K${gross.toFixed(2)}), more than ${MAX_FEE_FRACTION * 100}% — not treated as a collection fee` };
    }
    return { ok: true, plan: { gross, net, fee } };
}

/** "173", "#173", "r173", "Receipt 173" → "173"; anything else → null. */
export function receiptNumberOf(text: unknown): string | null {
    if (typeof text !== 'string') return null;
    const m = text.trim().match(/^(?:receipt\s*)?(?:no\.?\s*)?[#r]?\s*(\d{1,9})$/i);
    return m ? String(Number(m[1])) : null;
}

/** Idempotency keys for the external-account legs — the same convention the app's "Transfer to MoneyWise" uses. */
export const cashOutReference = (depositReference: string) => `${depositReference}-CASHOUT`;
export const feeReference = (depositReference: string) => `${depositReference}-FEE`;

export const TRANSFER_SOURCE_LABELS: Record<string, string> = { CASH: 'Cash', AIRTEL_MONEY: 'Mobile Money', BANK: 'Bank' };

export interface ExpenseAccount { id: string; code: string | null; name: string; is_active?: boolean | null }

/** The expense account the collection fee posts to: the one named (id / code / name), else a charges/fees account. */
export function resolveFeeAccount(accounts: ExpenseAccount[], given: string | null): ExpenseAccount | null {
    const usable = [...accounts].sort((a, b) => Number(b.is_active !== false) - Number(a.is_active !== false) || a.name.localeCompare(b.name));
    if (given) {
        const q = given.trim().toLowerCase();
        const hit = usable.find(a => a.id.toLowerCase() === q) ?? usable.find(a => (a.code ?? '').toLowerCase() === q) ?? usable.find(a => a.name.trim().toLowerCase() === q);
        if (hit) return hit;
    }
    return usable.find(a => /transaction\s*(charge|fee)|collection\s*(charge|fee)|mobile\s*money.*(charge|fee)|bank\s*charge/i.test(a.name))
        ?? usable.find(a => /\b(charge|fee)s?\b/i.test(a.name))
        ?? null;
}

/**
 * Gross cash that left a Lenco account for one debit — pure so it can be tested (scripts/test_lenco_gross.ts).
 * Used by the sync (`_gross`) so the wallet ledger mirrors the bank.
 *
 * Normal case: the balance drop between this transaction and its neighbour is "amount + bank fee".
 * Two failure modes the sync must survive:
 *  - ordering artefacts (batch payouts settle out of timestamp order) → the drop is nonsense → fall back;
 *  - rounding (a K2.19 on-us forward dropped the balance K2.18 → implied fee −K0.01) → the old `fee >= 0` test rejected
 *    it and the BANK tariff (K8.50) was booked on top: K2.19 became K10.69 (Blue Opus, 15 Nov 2026).
 * The fallback must never charge the bank tariff to a transfer that has no bank fee: forwards to another MoneyWise org
 * ("To <org> / Split-Inflow …") and the platform's own on-us references are free.
 */
export const MAX_PLAUSIBLE_FEE = 60;
export const ROUNDING_TOLERANCE = 0.02;

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Debits that move money inside Lenco (on-us): no bank fee ever applies. */
export function isFreeOnUsDebit(narration?: string | null, reference?: string | null): boolean {
    if (/^\s*to\s.+\/\s*split-inflow/i.test(narration || '')) return true;
    return /^(MWPAY-|SVT-|INVW-|PG-SUB-|SPLIT-)/i.test((reference || '').trim());
}

export function computeDebitGross(opts: {
    amount: number;
    prevBalance: number | null;
    curBalance: number | null;
    narration?: string | null;
    reference?: string | null;
    /** Published tariff for a payout of this size — only used when the balance drop can't be trusted. */
    tariff: (amount: number) => number;
}): number {
    const { amount, prevBalance, curBalance } = opts;
    if (prevBalance != null && curBalance != null && Number.isFinite(prevBalance) && Number.isFinite(curBalance)) {
        const delta = round2(prevBalance - curBalance);
        const impliedFee = round2(delta - amount);
        if (impliedFee >= 0 && impliedFee <= MAX_PLAUSIBLE_FEE) return delta;
        if (impliedFee < 0 && impliedFee >= -ROUNDING_TOLERANCE) return amount; // rounding noise, no fee
    }
    if (isFreeOnUsDebit(opts.narration, opts.reference)) return amount;
    return round2(amount + opts.tariff(amount));
}

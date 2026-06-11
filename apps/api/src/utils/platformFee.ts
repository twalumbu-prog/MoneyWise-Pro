/**
 * MoneyWise platform fee for external payment links (public pay portal).
 *
 * Tiered on the transaction subtotal. ADDITIVE markup: the customer pays
 * `subtotal + calculatePlatformFee(subtotal)`, the merchant settles the net
 * subtotal, and the fee is swept to the MoneyWise settlement account.
 *
 *   K0 – 100        → 2.5%
 *   K101 – 500      → 2%
 *   K501 – 750      → 1.8%
 *   K751 – 2,500    → 1.5%
 *   K2,501 – 5,000  → 1%
 *   K5,001 – 7,500  → 0.9%
 *   K7,501 and above → flat K75
 *
 * NOTE: This mirrors `calculatePlatformFee` in packages/shared (used by the web
 * app). It is duplicated here intentionally so the API has no build-time
 * dependency on the shared package's compiled output. Keep the two in sync.
 */
export function calculatePlatformFee(amount: number): number {
    if (!amount || amount <= 0) return 0;
    let fee: number;
    if (amount <= 100) fee = amount * 0.025;
    else if (amount <= 500) fee = amount * 0.02;
    else if (amount <= 750) fee = amount * 0.018;
    else if (amount <= 2500) fee = amount * 0.015;
    else if (amount <= 5000) fee = amount * 0.01;
    else if (amount <= 7500) fee = amount * 0.009;
    else fee = 75;
    // Round to 2 decimals (ngwee) to avoid floating-point dust in charges.
    return Math.round(fee * 100) / 100;
}

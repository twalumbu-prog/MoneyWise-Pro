/**
 * MoneyWise platform fee for external payment links — the same tiers as packages/shared `calculatePlatformFee`, which the public
 * pay pages use. The payer pays `subtotal + fee`, the business is credited the subtotal, and the fee is swept to the MoneyWise
 * settlement account. (Kept here rather than imported because the API doesn't load the shared package at runtime; the tiers are
 * pinned by test_pay_link.)
 *
 *   K0 – 100 → 2.5%   K101 – 500 → 2%   K501 – 750 → 1.8%   K751 – 2,500 → 1.5%
 *   K2,501 – 5,000 → 1%   K5,001 – 7,500 → 0.9%   K7,501 and above → flat K75
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
    return Math.round(fee * 100) / 100;
}

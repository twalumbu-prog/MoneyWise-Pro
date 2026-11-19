/**
 * What a reward voucher takes off an order. Pure (no database), so the rules are tested on their own and the checkout that applies a voucher
 * later uses exactly the same ones.
 *
 * - A voucher applies to the whole order, or only to the products its reward names.
 * - AMOUNT_OFF: that many kwacha, never more than the covered items cost.
 * - PERCENT_OFF: that share of what the covered items cost.
 * - FREE_ITEM: ONE unit of a covered product, the cheapest, so a business is never out by more than the reward's cheapest item.
 * - A voucher without a type (the original single reward) is an amount off.
 * - The discount is never negative, never more than the covered items, and rounded to the ngwee.
 */
export type RewardKind = 'AMOUNT_OFF' | 'PERCENT_OFF' | 'FREE_ITEM';
export interface CartLine { product_id: string; unit_price: number; quantity: number }
export interface VoucherTerms { reward_type: RewardKind | null | undefined; value: number; product_ids: string[] }
export interface Discount { amount: number; covered: number; reason?: string }

const round2 = (n: number) => Math.round(n * 100) / 100;

export function voucherDiscount(v: VoucherTerms, lines: CartLine[]): Discount {
    const clean = lines.filter((l) => Number.isFinite(l.unit_price) && l.unit_price > 0 && Number.isFinite(l.quantity) && l.quantity > 0);
    const only = new Set(v.product_ids ?? []);
    const covered = only.size === 0 ? clean : clean.filter((l) => only.has(l.product_id));
    const coveredTotal = round2(covered.reduce((s, l) => s + l.unit_price * l.quantity, 0));
    if (coveredTotal <= 0) return { amount: 0, covered: 0, reason: only.size === 0 ? 'There is nothing in this order to take money off.' : 'None of the items in this order are covered by this reward.' };
    const value = Number(v.value);
    if (!Number.isFinite(value) || value < 0) return { amount: 0, covered: coveredTotal, reason: 'This reward has no value set.' };

    let amount: number;
    switch (v.reward_type) {
        case 'PERCENT_OFF': amount = round2(coveredTotal * Math.min(100, value) / 100); break;
        case 'FREE_ITEM': amount = Math.min(...covered.map((l) => l.unit_price)); break;
        default: amount = value; // AMOUNT_OFF, and the original single reward
    }
    amount = round2(Math.min(Math.max(0, amount), coveredTotal));
    return { amount, covered: coveredTotal, ...(amount === 0 ? { reason: 'This reward would take nothing off this order.' } : {}) };
}

/**
 * Shares a discount across the order's lines in proportion to what each covered line costs, to the ngwee, with the last covered line taking the
 * remainder, so the shares always add up to exactly the discount. Lines the voucher doesn't cover get none. Returned in the same order as `lines`.
 */
export function allocateDiscount(v: Pick<VoucherTerms, 'product_ids'>, lines: CartLine[], discount: number): number[] {
    const only = new Set(v.product_ids ?? []);
    const covered = lines.map((l, i) => ({ i, total: (only.size === 0 || only.has(l.product_id)) && l.unit_price > 0 && l.quantity > 0 ? l.unit_price * l.quantity : 0 })).filter((c) => c.total > 0);
    const coveredTotal = covered.reduce((s, c) => s + c.total, 0);
    const out = lines.map(() => 0);
    if (coveredTotal <= 0 || discount <= 0) return out;
    let given = 0;
    covered.forEach((c, k) => {
        const share = k === covered.length - 1 ? round2(discount - given) : round2((discount * c.total) / coveredTotal);
        out[c.i] = share;
        given = round2(given + share);
    });
    return out;
}

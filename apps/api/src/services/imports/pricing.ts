/**
 * What an imported item costs a buyer in Zambia: the item and its shipping converted to kwacha, import duty and VAT on both, and
 * MoneyWise's fee. The rates behind it (exchange rates, fee, duty, VAT, shipping per kilogram) live in import_settings so the team can
 * change them without a deploy. Duty and VAT are an estimate: the real figure is set by ZRA when the parcel arrives.
 */

export interface ImportSettings {
    fx: Record<string, number>;
    pricing: { feePercent: number; minFee: number; dutyPercent: number; vatPercent: number; shippingPerKgUsd: number };
}

export const DEFAULT_SETTINGS: ImportSettings = {
    fx: { USD: 27, EUR: 29, GBP: 34, ZAR: 1.5, CNY: 3.7, ZMW: 1 },
    pricing: { feePercent: 10, minFee: 30, dutyPercent: 15, vatPercent: 16, shippingPerKgUsd: 12 },
};

export interface Priceable { price: number; currency: string; shipping_price: number; weight_kg: number | null }

export interface ImportQuote {
    quantity: number; currency: string; rate: number;
    itemZmw: number; shippingZmw: number; taxesZmw: number; feeZmw: number; totalZmw: number;
    /** What one item costs once it has arrived (the "from" price on a card). */
    perItemZmw: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export class PricingError extends Error {
    constructor(message: string) { super(message); }
}

export function priceImport(p: Priceable, quantity: number, s: ImportSettings): ImportQuote {
    const qty = Math.max(1, Math.floor(quantity) || 1);
    const currency = String(p.currency || 'USD').toUpperCase();
    const rate = Number(s.fx[currency]);
    if (!(rate > 0)) throw new PricingError(`No exchange rate for ${currency}.`);
    const usd = Number(s.fx.USD) > 0 ? Number(s.fx.USD) : 1;

    const itemZmw = round2(Number(p.price) * qty * rate);
    // Shipping: the source's own figure when it has one, otherwise the item's weight at a rate per kilogram (half a kilo when unknown).
    const shippingZmw = round2(Number(p.shipping_price) > 0
        ? Number(p.shipping_price) * qty * rate
        : (Number(p.weight_kg) > 0 ? Number(p.weight_kg) : 0.5) * qty * s.pricing.shippingPerKgUsd * usd);
    const duty = (itemZmw + shippingZmw) * (s.pricing.dutyPercent / 100);
    const vat = (itemZmw + shippingZmw + duty) * (s.pricing.vatPercent / 100);
    const taxesZmw = round2(duty + vat);
    const feeZmw = round2(Math.max(s.pricing.minFee, itemZmw * (s.pricing.feePercent / 100)));
    const totalZmw = round2(itemZmw + shippingZmw + taxesZmw + feeZmw);
    const one = qty === 1 ? totalZmw : priceImport(p, 1, s).totalZmw;
    return { quantity: qty, currency, rate, itemZmw, shippingZmw, taxesZmw, feeZmw, totalZmw, perItemZmw: one };
}

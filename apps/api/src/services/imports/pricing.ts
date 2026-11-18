/**
 * What an imported item costs a buyer in Zambia: the item and its shipping converted to kwacha, import duty and VAT on both, and
 * MoneyWise's fee. The rates behind it (exchange rates, fee, duty, VAT, shipping per kilogram) live in import_settings so the team can
 * change them without a deploy. Duty and VAT are an estimate: the real figure is set by ZRA when the parcel arrives.
 */

/** Duty for a car depends on its engine size and age. The first row (smallest engine, then youngest) that fits is used. */
export interface VehicleRule { maxCc: number; maxAgeYears: number; dutyPercent: number }
/**
 * What it costs to land a car in Lusaka beyond the dealer's price delivered to the port (Dar es Salaam): the road trip, duty by engine
 * size and age, VAT, clearing and MoneyWise's margin. `configured` stays false until the team has entered real figures, and until then
 * cars are not shown with a price — there is no guessed duty.
 */
export interface VehicleCosts { configured: boolean; preview?: boolean; transportZmw: number; clearingZmw: number; vatPercent: number; marginPercent: number; minMarginZmw: number; rules: VehicleRule[] }

export interface ImportSettings {
    fx: Record<string, number>;
    pricing: { feePercent: number; minFee: number; dutyPercent: number; vatPercent: number; shippingPerKgUsd: number; bufferPercent: number };
    vehicle: VehicleCosts;
}

export const DEFAULT_SETTINGS: ImportSettings = {
    fx: { USD: 27, EUR: 29, GBP: 34, ZAR: 1.5, CNY: 3.7, ZMW: 1 },
    pricing: { feePercent: 10, minFee: 10, dutyPercent: 0, vatPercent: 16, shippingPerKgUsd: 12, bufferPercent: 5 },
    vehicle: { configured: false, transportZmw: 0, clearingZmw: 0, vatPercent: 16, marginPercent: 0, minMarginZmw: 0, rules: [] },
};

export interface Priceable { price: number; currency: string; shipping_price: number; weight_kg: number | null; source?: string; category?: string | null; specs?: Record<string, any> | null }

/** An item whose shipping alone is far more than the item (a K11 item with K1,164 shipping) isn't offered: nobody would buy it. */
export const isTooCostly = (q: ImportQuote): boolean => !q.estimate && q.itemZmw < 300 && q.shippingZmw > 3 * q.itemZmw;

export const isVehicle = (p: Priceable): boolean => p.category === 'Cars' && Number(p.specs?.engineCc) > 0;

/** Sources whose price is a live market price that can move before we buy, so a small buffer is added on top. */
export const MARKET_PRICED = new Set(['WEB', 'EBAY']);

export interface ImportQuote {
    quantity: number; currency: string; rate: number;
    itemZmw: number; shippingZmw: number; taxesZmw: number; feeZmw: number; totalZmw: number;
    /** What one item costs once it has arrived (the "from" price on a card). */
    perItemZmw: number;
    /** True for a car priced from provisional costs: shown as an estimate and not yet open to orders. */
    estimate?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export class PricingError extends Error {
    constructor(message: string) { super(message); }
}

/** A car: one only. The dealer's price and its delivery to the port are in dollars; everything after the port is in kwacha. */
function priceVehicle(p: Priceable, s: ImportSettings): ImportQuote {
    const v = s.vehicle;
    if (!v?.configured && !v?.preview) throw new PricingError('Car costs haven’t been set up yet.');
    const rate = Number(s.fx.USD);
    if (!(rate > 0)) throw new PricingError('No exchange rate for USD.');
    const cc = Number(p.specs?.engineCc);
    const year = Number(p.specs?.year);
    const age = Math.max(0, new Date().getFullYear() - (year > 1950 ? year : new Date().getFullYear()));
    const rule = v.rules.find((r) => cc <= r.maxCc && age <= r.maxAgeYears);
    if (!rule) throw new PricingError('No duty rate is set for a car this size and age.');

    const itemZmw = round2(Number(p.price) * rate);
    const portZmw = round2(Number(p.shipping_price) * rate); // dealer's freight, inspection and certificate to Dar es Salaam
    const cif = itemZmw + portZmw;
    const duty = cif * (rule.dutyPercent / 100);
    const vat = (cif + duty) * (v.vatPercent / 100);
    const shippingZmw = round2(portZmw + v.transportZmw);
    const taxesZmw = round2(duty + vat);
    const feeZmw = round2(v.clearingZmw + Math.max(v.minMarginZmw, cif * (v.marginPercent / 100)));
    const totalZmw = round2(itemZmw + shippingZmw + taxesZmw + feeZmw);
    return { quantity: 1, currency: 'USD', rate, itemZmw, shippingZmw, taxesZmw, feeZmw, totalZmw, perItemZmw: totalZmw, estimate: !v.configured };
}

export function priceImport(p: Priceable, quantity: number, s: ImportSettings): ImportQuote {
    if (isVehicle(p)) return priceVehicle(p, s);
    // A car whose details (engine size) couldn't be read must never be priced like an ordinary parcel.
    if (p.category === 'Cars') throw new PricingError('This car’s details are incomplete.');
    const qty = Math.max(1, Math.floor(quantity) || 1);
    const currency = String(p.currency || 'USD').toUpperCase();
    const rate = Number(s.fx[currency]);
    if (!(rate > 0)) throw new PricingError(`No exchange rate for ${currency}.`);
    const usd = Number(s.fx.USD) > 0 ? Number(s.fx.USD) : 1;

    const buffer = p.source && MARKET_PRICED.has(p.source) ? 1 + (Number(s.pricing.bufferPercent) || 0) / 100 : 1;
    const itemZmw = round2(Number(p.price) * buffer * qty * rate);
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

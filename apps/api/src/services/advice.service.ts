/**
 * Buying advice. Given a list of what someone needs (a basket), it works out where to buy it: the cheapest single place that has everything,
 * and the cheapest mix across places. It also summarises what other businesses pay (only for products enough of them chose to share, and
 * never naming anyone), and keeps the sharing switch.
 */
import { supabase } from '../lib/supabase';
import { Offer, PriceError, compare } from './priceCompare.service';

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * q; const lo = Math.floor(i); const hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const lower = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase();

/* ───────────── Starter baskets ───────────── */

/** Example jobs, so a builder doesn't start from an empty list. The quantities are illustrations to edit, not recommendations. */
export const TEMPLATES: { id: string; name: string; lines: [slug: string, quantity: number][] }[] = [
    { id: 'foundation-walls', name: 'Foundation and walls', lines: [['cement-50-kg-bag-32-5', 40], ['river-sand', 6], ['crusher-stone-19-mm', 4], ['hollow-block-6-inch-150-mm', 500], ['reinforcing-bar-y12-12-m', 20], ['reinforcing-bar-y8-12-m', 30]] },
    { id: 'roofing', name: 'Roofing job', lines: [['ibr-roofing-sheet-0-4-mm', 120], ['timber-50-x-100-mm', 60], ['roofing-screws-box-of-100', 4], ['ridge-cap', 20], ['gutter-3-m', 6]] },
    { id: 'bathroom', name: 'Bathroom fit-out', lines: [['toilet-wc-set', 1], ['wash-basin', 1], ['shower-mixer', 1], ['pvc-pipe-110-mm-6-m', 2], ['pvc-pressure-pipe-25-mm-6-m', 4]] },
    { id: 'monthly-groceries', name: 'Monthly family groceries', lines: [['mealie-meal-breakfast-25-kg', 2], ['rice-5-kg', 1], ['sugar-2-kg', 2], ['cooking-oil-2-litre', 2], ['salt-1-kg', 1], ['eggs-tray-of-30', 2], ['tomatoes', 4], ['onions', 4], ['washing-powder-2-kg', 1], ['bathing-soap', 4], ['toilet-paper-9-rolls', 2]] },
    { id: 'tuck-shop', name: 'Tuck shop restock', lines: [['mealie-meal-breakfast-25-kg', 10], ['sugar-2-kg', 20], ['cooking-oil-2-litre', 12], ['salt-1-kg', 12], ['rice-5-kg', 8], ['bathing-soap', 24], ['laundry-soap-bar', 24]] },
    { id: 'painting', name: 'Painting a house', lines: [['emulsion-paint-20-litre', 6], ['undercoat-20-litre', 2], ['wall-putty-25-kg', 8], ['paint-brush-100-mm', 4], ['paint-roller-set', 2]] },
];

export async function templates() {
    const slugs = [...new Set(TEMPLATES.flatMap((t) => t.lines.map((l) => l[0])))];
    const { data } = await supabase.from('catalog_items').select('id, slug, name, unit, unit_detail, category').in('slug', slugs).eq('is_active', true);
    const by = new Map<string, any>((data ?? []).map((i: any) => [i.slug, i]));
    return {
        templates: TEMPLATES.map((t) => ({ id: t.id, name: t.name, lines: t.lines.filter(([slug]) => by.has(slug)).map(([slug, quantity]) => ({ item: by.get(slug), quantity })) })).filter((t) => t.lines.length > 0),
    };
}

/* ───────────── Where to buy a basket ───────────── */

export interface BasketLine { catalogItemId: string; quantity: number }
interface Pick { itemId: string; itemName: string; unit: string; quantity: number; price: number; lineTotal: number; place: string; town: string | null; phone: string | null; trust: string; sourceType: string; ageDays: number | null; delivers: boolean; productId?: string }
interface Option { places: { place: string; town: string | null; phone: string | null }[]; total: number; savings: number | null; lines: Pick[]; missing: string[] }

const placeId = (o: Offer) => `${lower(o.place)}|${lower(o.town)}`;

export async function basket(lines: BasketLine[], town?: string) {
    const clean = (Array.isArray(lines) ? lines : []).map((l) => ({ catalogItemId: String(l?.catalogItemId ?? ''), quantity: num(l?.quantity) })).filter((l) => l.catalogItemId && l.quantity > 0).slice(0, 20);
    if (!clean.length) throw new PriceError('Add at least one product and how many you need.', 400, 'EMPTY');
    const results = await Promise.all(clean.map((l) => compare(l.catalogItemId)));
    const notes: string[] = [];
    const want = lower(town);

    // What each place can supply: for every product, its cheapest usable offer at that place.
    const places = new Map<string, { place: string; town: string | null; phone: string | null; picks: Map<number, Pick> }>();
    const cheapestAnywhere = new Map<number, Pick>();
    clean.forEach((line, i) => {
        const r = results[i];
        // A price counts when it is current, in stock, and (for bulk prices) the quantity reaches the minimum.
        let usable = r.offers.filter((o) => o.freshness !== 'STALE' && !o.outOfStock && (!o.minQty || o.minQty <= line.quantity));
        if (want) {
            const near = usable.filter((o) => lower(o.town) === want || o.delivers);
            if (near.length) usable = near; else if (usable.length) notes.push(`Nothing for ${r.item.name} in or delivering to ${town}, so prices from elsewhere are shown.`);
        }
        if (!usable.length) { notes.push(`No current price for ${r.item.name} yet.`); return; }
        for (const o of usable) {
            const pick: Pick = { itemId: r.item.id, itemName: r.item.name, unit: r.item.unit, quantity: line.quantity, price: o.price, lineTotal: round2(o.price * line.quantity), place: o.place, town: o.town, phone: o.phone, trust: o.trust, sourceType: o.sourceType, ageDays: o.ageDays, delivers: o.delivers, productId: o.productId };
            const id = placeId(o);
            const p = places.get(id) ?? { place: o.place, town: o.town, phone: o.phone, picks: new Map<number, Pick>() };
            const have = p.picks.get(i);
            if (!have || pick.price < have.price) p.picks.set(i, pick);
            places.set(id, p);
            const best = cheapestAnywhere.get(i);
            if (!best || pick.price < best.price) cheapestAnywhere.set(i, pick);
        }
    });

    const typicalTotal = clean.reduce((s, l, i) => s + (results[i].stats.typical ? results[i].stats.typical! * l.quantity : 0), 0);
    const typicalCovered = (idx: number[]) => idx.reduce((s, i) => s + (results[i].stats.typical ? results[i].stats.typical! * clean[i].quantity : 0), 0);
    const toOption = (picks: Map<number, Pick> | Pick[], covered: number[], names: string[]): Option => {
        const arr = Array.isArray(picks) ? picks : [...picks.values()];
        const total = round2(arr.reduce((s, p) => s + p.lineTotal, 0));
        const seen = new Map<string, { place: string; town: string | null; phone: string | null }>();
        arr.forEach((p) => seen.set(`${lower(p.place)}|${lower(p.town)}`, { place: p.place, town: p.town, phone: p.phone }));
        const base = typicalCovered(covered);
        return { places: [...seen.values()], total, savings: base > 0 ? round2(base - total) : null, lines: arr, missing: names };
    };

    const all = clean.map((_, i) => i);
    const supplied = all.filter((i) => cheapestAnywhere.has(i));
    const namesOf = (idx: number[]) => idx.map((i) => results[i].item.name);

    // One place that has everything (or, failing that, the places that cover the most).
    const singles = [...places.values()].map((p) => {
        const covered = all.filter((i) => p.picks.has(i));
        const missing = all.filter((i) => !p.picks.has(i) && cheapestAnywhere.has(i));
        return { covered, opt: toOption(p.picks, covered, namesOf(missing)), full: missing.length === 0 };
    });
    const full = singles.filter((s) => s.full).sort((a, b) => a.opt.total - b.opt.total);
    const partial = singles.filter((s) => !s.full).sort((a, b) => b.covered.length - a.covered.length || a.opt.total - b.opt.total);
    const singleOptions = (full.length ? full : partial).slice(0, 3).map((s) => s.opt);

    // The cheapest mix: each product from wherever it is cheapest.
    const mix = supplied.length ? toOption(supplied.map((i) => cheapestAnywhere.get(i)!), supplied, namesOf(all.filter((i) => !cheapestAnywhere.has(i)))) : null;
    const bestSingle = full[0]?.opt ?? null;
    const extraForOnePlace = bestSingle && mix && mix.missing.length === 0 ? round2(bestSingle.total - mix.total) : null;
    if (extraForOnePlace !== null && extraForOnePlace > 0 && mix && mix.places.length > 1) notes.push(`Buying everything from one place costs ${'K' + extraForOnePlace.toLocaleString()} more than splitting it across ${mix.places.length} places.`);

    return {
        lines: clean.map((l, i) => ({ item: results[i].item, quantity: l.quantity, typical: results[i].stats.typical, offerCount: results[i].stats.counted })),
        singleOptions, fullCoverage: full.length > 0, mix, typicalTotal: typicalTotal > 0 ? round2(typicalTotal) : null, notes: [...new Set(notes)],
    };
}

/* ───────────── What other businesses pay (opt-in, anonymous) ───────────── */

/** At least this many different businesses must have bought a product for any figure to be shown, so nobody can be picked out. */
export const MIN_BUSINESSES = 5;
const WINDOW_DAYS = 90;
const shareKey = (orgId: string) => `price_share:${orgId}`;

export async function getSharing(orgId: string) {
    const { data } = await supabase.from('app_settings').select('value').eq('key', shareKey(orgId)).maybeSingle();
    return { sharing: data?.value?.on === true };
}
export async function setSharing(orgId: string, on: boolean) {
    const { error } = await supabase.from('app_settings').upsert({ key: shareKey(orgId), value: { on: on === true }, description: 'Share anonymous purchase prices to help others compare', updated_at: new Date().toISOString() });
    if (error) throw error;
    return { sharing: on === true };
}

/** What businesses that opted in paid for a catalogue product over the last 90 days, or null when too few of them bought it to show. */
export async function businessPrices(itemId: string) {
    const { data: shared } = await supabase.from('app_settings').select('key, value').like('key', 'price_share:%').limit(5000);
    const orgIds = (shared ?? []).filter((r: any) => r.value?.on === true).map((r: any) => String(r.key).slice('price_share:'.length));
    if (orgIds.length < MIN_BUSINESSES) return null;
    const { data: products } = await supabase.from('products').select('id, organization_id').eq('catalog_item_id', itemId).in('organization_id', orgIds).limit(2000);
    if (!products?.length) return null;
    const orgOfProduct = new Map<string, string>(products.map((p: any) => [p.id, p.organization_id]));
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
    const { data: lines } = await supabase.from('purchase_bill_lines').select('product_id, unit_cost, bill_id').in('product_id', [...orgOfProduct.keys()]).limit(5000);
    if (!lines?.length) return null;
    const { data: bills } = await supabase.from('purchase_bills').select('id, status, bill_date').in('id', [...new Set(lines.map((l: any) => l.bill_id))]).neq('status', 'VOID').gte('bill_date', since);
    const okBills = new Set((bills ?? []).map((b: any) => b.id));
    const perOrg = new Map<string, number[]>();
    for (const l of lines) {
        if (!okBills.has(l.bill_id) || !(num(l.unit_cost) > 0)) continue;
        const org = orgOfProduct.get(l.product_id);
        if (org) perOrg.set(org, [...(perOrg.get(org) ?? []), num(l.unit_cost)]);
    }
    if (perOrg.size < MIN_BUSINESSES) return null;
    // Each business counts once, however many times it bought: its own typical cost is its vote.
    const votes = [...perOrg.values()].map((xs) => median(xs));
    return { businesses: votes.length, median: round2(median(votes)), low: round2(quantile(votes, 0.25)), high: round2(quantile(votes, 0.75)), days: WINDOW_DAYS };
}

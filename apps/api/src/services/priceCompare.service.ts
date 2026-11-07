/**
 * Price comparison. A shared catalogue of products ("Cement 50 kg bag") lets the same product be compared across places:
 *   - MoneyWise sellers' listings that name the catalogue item (these can be bought with escrow), and
 *   - price records from places that are not on MoneyWise (a depot's price list, a shelf price, a quote).
 * Every offer is priced for one catalogue unit and carries a date, so an old price is never passed off as current.
 */
import { supabase } from '../lib/supabase';

export class PriceError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'PRICE') { super(message); }
}

const DAY = 86_400_000;
/** Younger than this is "fresh"; older than STALE_DAYS no longer counts toward the cheapest or typical price. */
export const FRESH_DAYS = 30;
export const STALE_DAYS = 90;

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round2 = (n: number) => Math.round(n * 100) / 100;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export interface CatalogItem { id: string; slug: string; name: string; category: string; vertical: string; unit: string; unit_detail: string | null; brand: string | null; keywords: string | null; is_active: boolean }
const ITEM_COLS = 'id, slug, name, category, vertical, unit, unit_detail, brand, keywords, is_active';

const missingTable = (e: any) => /catalog_items|price_points|catalog_item_id|schema cache|does not exist/i.test(String(e?.message ?? ''));

/* ───────────── The catalogue ───────────── */

export async function searchCatalog(q?: string, category?: string, vertical = 'CONSTRUCTION') {
    let qb = supabase.from('catalog_items').select(ITEM_COLS).eq('is_active', true).order('vertical').order('category').order('name').limit(900);
    if (vertical !== 'ALL') qb = qb.eq('vertical', vertical);
    if (category) qb = qb.eq('category', category);
    const { data, error } = await qb;
    if (error) { if (missingTable(error)) return { items: [] as CatalogItem[], categories: [] as { name: string; count: number }[], needsMigration: true }; throw error; }
    const all = (data ?? []) as CatalogItem[];
    const words = String(q ?? '').toLowerCase().split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 1).slice(0, 5);
    const items = words.length ? all.filter((i) => { const hay = `${i.name} ${i.category} ${i.brand ?? ''} ${i.keywords ?? ''}`.toLowerCase(); return words.every((w) => hay.includes(w)); }) : all;

    const counts = new Map<string, number>();
    for (const i of all) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
    return { items: items.slice(0, 120), categories: [...counts].map(([name, count]) => ({ name, count })), needsMigration: false };
}

export async function getItem(idOrSlug: string): Promise<CatalogItem> {
    const key = String(idOrSlug ?? '').trim();
    const { data, error } = await supabase.from('catalog_items').select(ITEM_COLS).eq(isUuid(key) ? 'id' : 'slug', key).eq('is_active', true).maybeSingle();
    if (error) { if (missingTable(error)) throw new PriceError('Price comparison is opening soon.', 409, 'NOT_READY'); throw error; }
    if (!data) throw new PriceError('That product isn’t in the catalogue.', 404, 'NOT_FOUND');
    return data as CatalogItem;
}

/** True when the id names a live catalogue item (used when a seller links a listing). */
export async function catalogItemExists(id: string): Promise<boolean> {
    if (!isUuid(String(id))) return false;
    const { data } = await supabase.from('catalog_items').select('id').eq('id', id).eq('is_active', true).maybeSingle();
    return !!data;
}

/* ───────────── The comparison ───────────── */

export interface Offer {
    id: string;
    kind: 'LISTING' | 'PRICE_POINT';
    place: string; town: string | null; province: string | null; phone: string | null; address: string | null;
    price: number; minQty: number | null; delivers: boolean; deliveryNote: string | null;
    observedOn: string | null; ageDays: number | null;
    freshness: 'LIVE' | 'FRESH' | 'AGING' | 'STALE';
    /** LISTED: on MoneyWise and can be bought here. VERIFIED: checked by us. ENTERED: collected from the place and not independently checked. */
    trust: 'LISTED' | 'VERIFIED' | 'ENTERED';
    sourceType: string;
    productId?: string; orgId?: string; rating?: number | null; ratingCount?: number; outOfStock?: boolean;
    cheapest?: boolean;
    /** A MoneyWise seller's track record: orders taken, and the share completed and disputed. */
    seller?: { orders: number; completedPct: number | null; disputePct: number | null };
    /** How many different shoppers have reported about this price here (shopper reports only). */
    confirmations?: number;
    /** How much cheaper than the typical price (positive), or dearer (negative). Only for offers that count. */
    vsTypical?: number;
}

export async function compare(idOrSlug: string) {
    const item = await getItem(idOrSlug);
    const now = Date.now();
    const offers: Offer[] = [];

    // 1. Sellers on MoneyWise that named this catalogue item.
    const { data: products, error: pe } = await supabase.from('products').select('id, organization_id, name, price, is_active, marketplace_listed, track_stock, stock_quantity, updated_at').eq('catalog_item_id', item.id).eq('marketplace_listed', true).eq('is_active', true).limit(300);
    if (pe && !missingTable(pe)) throw pe;
    const rows = products ?? [];
    if (rows.length) {
        const orgIds = [...new Set(rows.map((p: any) => p.organization_id))];
        const [orgs, profiles, reviews, orders] = await Promise.all([
            supabase.from('organizations').select('id, name, phone, address').in('id', orgIds),
            supabase.from('business_profiles').select('organization_id, phone, city, province, street').in('organization_id', orgIds),
            supabase.from('marketplace_reviews').select('seller_org_id, rating').in('seller_org_id', orgIds),
            supabase.from('marketplace_orders').select('seller_org_id, status, dispute_opened_at').in('seller_org_id', orgIds).limit(5000),
        ]);
        const track = new Map<string, { n: number; done: number; disputed: number }>();
        for (const o of (orders.data ?? []) as any[]) {
            if (['PENDING_PAYMENT', 'FAILED'].includes(o.status)) continue;
            const t = track.get(o.seller_org_id) ?? { n: 0, done: 0, disputed: 0 };
            t.n++; if (o.status === 'COMPLETED') t.done++; if (o.status === 'DISPUTED' || o.dispute_opened_at) t.disputed++;
            track.set(o.seller_org_id, t);
        }
        const org = new Map<string, any>((orgs.data ?? []).map((o: any) => [o.id, o]));
        const prof = new Map<string, any>((profiles.data ?? []).map((p: any) => [p.organization_id, p]));
        const rate = new Map<string, { sum: number; n: number }>();
        for (const r of reviews.data ?? []) { const c = rate.get(r.seller_org_id) ?? { sum: 0, n: 0 }; c.sum += r.rating; c.n++; rate.set(r.seller_org_id, c); }
        for (const p of rows as any[]) {
            const o = org.get(p.organization_id) ?? {}; const pr = prof.get(p.organization_id) ?? {}; const rt = rate.get(p.organization_id);
            offers.push({
                id: p.id, kind: 'LISTING', place: o.name ?? 'Seller', town: pr.city ?? null, province: pr.province ?? null, phone: pr.phone ?? o.phone ?? null, address: [pr.street, pr.city].filter(Boolean).join(', ') || o.address || null,
                price: round2(num(p.price)), minQty: null, delivers: false, deliveryNote: null, observedOn: p.updated_at ? String(p.updated_at).slice(0, 10) : null, ageDays: 0, freshness: 'LIVE',
                trust: 'LISTED', sourceType: 'LISTING', productId: p.id, orgId: p.organization_id, rating: rt ? round2(rt.sum / rt.n) : null, ratingCount: rt?.n ?? 0,
                outOfStock: p.track_stock === true && num(p.stock_quantity) <= 0,
                seller: (() => { const t = track.get(p.organization_id); return { orders: t?.n ?? 0, completedPct: t && t.n >= 3 ? Math.round((100 * t.done) / t.n) : null, disputePct: t && t.n >= 3 ? Math.round((100 * t.disputed) / t.n) : null }; })(),
            });
        }
    }

    // 2. Prices collected from places that aren't MoneyWise sellers.
    const { data: points, error: ppe } = await supabase.from('price_points').select('*').eq('catalog_item_id', item.id).eq('status', 'ACTIVE').order('observed_on', { ascending: false }).limit(300);
    if (ppe && !missingTable(ppe)) throw ppe;
    for (const p of (points ?? []) as any[]) {
        const age = Math.max(0, Math.floor((now - Date.parse(`${p.observed_on}T12:00:00Z`)) / DAY));
        offers.push({
            id: p.id, kind: 'PRICE_POINT', place: p.place_name, town: p.town, province: p.province, phone: p.phone, address: p.address,
            price: round2(num(p.price)), minQty: p.min_qty ?? null, delivers: !!p.delivers, deliveryNote: p.delivery_note ?? null, observedOn: p.observed_on, ageDays: age,
            freshness: age <= FRESH_DAYS ? 'FRESH' : age <= STALE_DAYS ? 'AGING' : 'STALE', trust: p.trust === 'VERIFIED' ? 'VERIFIED' : 'ENTERED', sourceType: p.source_type, orgId: p.org_id ?? undefined, confirmations: p.confirmations ?? 1,
        });
    }

    // Only current, single-unit, in-stock prices set the cheapest and the typical price. Bulk prices and old ones are still shown, after.
    const counts = (o: Offer) => o.freshness !== 'STALE' && !o.outOfStock && !(o.minQty && o.minQty > 1);
    const counted = offers.filter(counts);
    const prices = counted.map((o) => o.price);
    const typical = prices.length ? round2(median(prices)) : null;
    const lowest = prices.length ? Math.min(...prices) : null;
    for (const o of counted) { o.vsTypical = typical !== null ? round2(typical - o.price) : undefined; if (o.price === lowest) o.cheapest = true; }
    const order = (o: Offer) => (counts(o) ? 0 : o.freshness === 'STALE' || o.outOfStock ? 2 : 1);
    offers.sort((a, b) => order(a) - order(b) || a.price - b.price || (a.ageDays ?? 0) - (b.ageDays ?? 0));

    const towns = [...new Set(offers.map((o) => o.town).filter((t): t is string => !!t))].sort();
    return {
        item,
        stats: { offers: offers.length, counted: counted.length, lowest, typical, highest: prices.length ? Math.max(...prices) : null, spread: prices.length > 1 && lowest ? round2((Math.max(...prices) - lowest)) : null },
        towns, offers,
        note: counted.length === 0 ? 'No current prices yet for this product.' : counted.length < 3 ? 'Only a few prices so far, so the typical price is rough.' : null,
    };
}

/* ───────────── The team's desk ───────────── */

export async function deskOverview() {
    const [items, pts] = await Promise.all([
        supabase.from('catalog_items').select(ITEM_COLS).order('vertical').order('category').order('name').limit(1500),
        supabase.from('price_points').select('id, catalog_item_id, source_type, place_name, town, province, phone, price, min_qty, delivers, observed_on, status, trust, created_at').order('created_at', { ascending: false }).limit(200),
    ]);
    if (items.error) { if (missingTable(items.error)) return { items: [], pricePoints: [], needsMigration: true }; throw items.error; }
    return { items: items.data ?? [], pricePoints: pts.data ?? [], needsMigration: false };
}

export async function saveItem(input: any, id?: string) {
    const name = String(input?.name ?? '').trim().slice(0, 120);
    const category = String(input?.category ?? '').trim().slice(0, 60);
    const unit = String(input?.unit ?? '').trim().toLowerCase().slice(0, 30);
    if (!name || !category || !unit) throw new PriceError('A name, a category and a unit (bag, piece, tonne...) are needed.');
    const row = {
        name, category, unit, vertical: String(input?.vertical ?? 'CONSTRUCTION').toUpperCase().slice(0, 30), unit_detail: String(input?.unitDetail ?? input?.unit_detail ?? '').trim().slice(0, 40) || null,
        brand: String(input?.brand ?? '').trim().slice(0, 60) || null, keywords: String(input?.keywords ?? '').trim().slice(0, 200) || null, is_active: input?.isActive !== false, updated_at: new Date().toISOString(),
    };
    if (id) {
        const { data, error } = await supabase.from('catalog_items').update(row).eq('id', id).select(ITEM_COLS).single();
        if (error) throw error; return data;
    }
    const slug = slugify(String(input?.slug ?? name));
    const { data, error } = await supabase.from('catalog_items').upsert({ slug, ...row }, { onConflict: 'slug' }).select(ITEM_COLS).single();
    if (error) throw error; return data;
}

export async function savePricePoint(input: any, by: string, id?: string) {
    const price = Number(input?.price);
    if (!(price > 0)) throw new PriceError('Enter the price for one unit.');
    const place = String(input?.placeName ?? input?.place_name ?? '').trim().slice(0, 120);
    if (!place) throw new PriceError('Say where this price is from.');
    const itemId = String(input?.catalogItemId ?? input?.catalog_item_id ?? '');
    if (!id && !(await catalogItemExists(itemId))) throw new PriceError('Choose a product from the catalogue.');
    const observed = String(input?.observedOn ?? input?.observed_on ?? '').slice(0, 10);
    if (observed && (!/^\d{4}-\d{2}-\d{2}$/.test(observed) || Date.parse(observed) > Date.now() + DAY)) throw new PriceError('The date can’t be in the future.');
    const clean = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n) || null;
    const row: Record<string, unknown> = {
        place_name: place, town: clean(input?.town, 60), province: clean(input?.province, 60), address: clean(input?.address, 160), phone: clean(input?.phone, 30), price: Math.round(price * 100) / 100,
        min_qty: Number(input?.minQty ?? input?.min_qty) > 1 ? Math.floor(Number(input?.minQty ?? input?.min_qty)) : null, delivers: input?.delivers === true, delivery_note: clean(input?.deliveryNote ?? input?.delivery_note, 160),
        ...(observed ? { observed_on: observed } : {}), source_type: ['SUPPLIER_LIST', 'SHOPPER_REPORT', 'RFQ_QUOTE', 'BUSINESS_AGGREGATE'].includes(input?.sourceType) ? input.sourceType : 'SUPPLIER_LIST',
        trust: input?.trust === 'VERIFIED' ? 'VERIFIED' : 'ENTERED', updated_at: new Date().toISOString(),
    };
    if (id) {
        if (input?.status && ['ACTIVE', 'PENDING', 'REJECTED', 'EXPIRED'].includes(input.status)) row.status = input.status;
        const { data, error } = await supabase.from('price_points').update(row).eq('id', id).select('*').single();
        if (error) throw error; return data;
    }
    const { data, error } = await supabase.from('price_points').insert({ ...row, catalog_item_id: itemId, created_by: isUuid(by) ? by : null }).select('*').single();
    if (error) throw error; return data;
}

export async function setPricePointStatus(id: string, status: string) {
    if (!['ACTIVE', 'PENDING', 'REJECTED', 'EXPIRED'].includes(status)) throw new PriceError('Unknown status.');
    const { data, error } = await supabase.from('price_points').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    if (error) throw error; return data;
}

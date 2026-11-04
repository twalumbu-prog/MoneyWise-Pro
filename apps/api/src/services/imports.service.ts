import { supabase } from '../lib/supabase';
import { payLinkService, PayLinkError } from './payLink.service';
import { notifySeller, notifyUser } from './marketplaceNotify';
import { DEFAULT_SETTINGS, ImportSettings, PricingError, priceImport } from './imports/pricing';
import { CONNECTORS, SourceItem, backgroundTurn, connectorFor, connectorForUrl, userFirst } from './imports/sources';

/**
 * Imported products: things from overseas stores that MoneyWise buys for the customer.
 *
 *   catalogue   imported_products holds each item with its price at the source. A scheduled job keeps them current (see refreshStale) and a
 *               customer opening an item refreshes it on the spot when it's an hour old.
 *   ordering    the buyer pays the total in kwacha from their wallet to the MoneyWise imports account (IMPORT_ORG_USERNAME). The team buys
 *               the item at the source, then records the supplier's order and tracking numbers; the buyer follows them in the app.
 *   cancelling  a cancelled order is paid back from the imports account (IMPORT_ORG_ID and IMPORT_ADMIN_USER_ID).
 */

export class ImportError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'INVALID') { super(message); }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const HOUR = 3_600_000;
const isTableMissing = (e: any) => /imported_products|import_orders|import_settings|schema cache/i.test(String(e?.message ?? ''));

export const STATUSES = ['PAID', 'ORDERED', 'SHIPPED', 'IN_TRANSIT', 'CUSTOMS', 'IN_LUSAKA', 'DELIVERED', 'CANCELLED'] as const;
const STATUS_TEXT: Record<string, string> = {
    PAID: 'We’ve got your payment and will buy it now', ORDERED: 'We’ve bought it from the seller', SHIPPED: 'It has left the seller and has a tracking number',
    IN_TRANSIT: 'It’s on its way to Zambia', CUSTOMS: 'It’s going through customs', IN_LUSAKA: 'It’s arrived in Lusaka and is ready for you', DELIVERED: 'It’s been delivered', CANCELLED: 'Your order was cancelled and refunded',
};

/* ───────────── Settings ───────────── */

let settingsCache: { at: number; value: ImportSettings; feeds: Feed[] } | null = null;
export interface Feed { source: string; query: string; category?: string; limit?: number }

export async function loadSettings(force = false): Promise<{ settings: ImportSettings; feeds: Feed[] }> {
    if (!force && settingsCache && Date.now() - settingsCache.at < 60_000) return { settings: settingsCache.value, feeds: settingsCache.feeds };
    const { data } = await supabase.from('import_settings').select('key, value');
    const m = new Map((data ?? []).map((r: any) => [r.key, r.value]));
    const value: ImportSettings = {
        fx: { ...DEFAULT_SETTINGS.fx, ...((m.get('fx') as object) ?? {}) },
        pricing: { ...DEFAULT_SETTINGS.pricing, ...((m.get('pricing') as object) ?? {}) },
    };
    const feeds = Array.isArray(m.get('feeds')) ? (m.get('feeds') as Feed[]) : [];
    settingsCache = { at: Date.now(), value, feeds };
    return { settings: value, feeds };
}

export async function saveSettings(input: { fx?: Record<string, number>; pricing?: Partial<ImportSettings['pricing']>; feeds?: Feed[] }) {
    const rows: { key: string; value: unknown }[] = [];
    if (input.fx) {
        const fx: Record<string, number> = {};
        for (const [k, v] of Object.entries(input.fx)) if (/^[A-Z]{3}$/.test(k) && Number(v) > 0) fx[k] = Number(v);
        if (!(fx.USD > 0)) throw new ImportError('The dollar rate is needed.', 400, 'FX');
        rows.push({ key: 'fx', value: { ...fx, ZMW: 1 } });
    }
    if (input.pricing) {
        const cur = (await loadSettings(true)).settings.pricing;
        const p = { ...cur };
        for (const k of Object.keys(cur) as (keyof typeof cur)[]) if (input.pricing[k] !== undefined) { const n = Number(input.pricing[k]); if (!(n >= 0)) throw new ImportError(`${k} must be a number.`, 400, 'PRICING'); p[k] = n; }
        rows.push({ key: 'pricing', value: p });
    }
    if (input.feeds) {
        const feeds = input.feeds.filter((f) => f && CONNECTORS[f.source] && String(f.query ?? '').trim()).slice(0, 30).map((f) => ({ source: f.source, query: String(f.query).trim().slice(0, 80), category: f.category ? String(f.category).slice(0, 60) : undefined, limit: Math.min(30, Math.max(1, Math.floor(Number(f.limit) || 10))) }));
        rows.push({ key: 'feeds', value: feeds });
    }
    for (const r of rows) await supabase.from('import_settings').upsert({ key: r.key, value: r.value, updated_at: new Date().toISOString() });
    settingsCache = null;
    return loadSettings(true);
}

/* ───────────── Catalogue ───────────── */

const PRODUCT_COLS = 'id, source, source_id, source_url, title, description, images, category, origin, price, currency, shipping_price, weight_kg, delivery_days_min, delivery_days_max, options, is_active, listed, views, last_refreshed_at, refresh_error, created_at';

const publicView = (p: any, s: ImportSettings) => {
    let perItemZmw: number | null = null;
    try { perItemZmw = priceImport(p, 1, s).totalZmw; } catch { /* no rate for this currency: the item is shown without a price */ }
    return {
        id: p.id, title: p.title, description: p.description, images: p.images ?? [], category: p.category, origin: p.origin, source: p.source,
        perItemZmw, deliveryDaysMin: p.delivery_days_min, deliveryDaysMax: p.delivery_days_max, options: p.options ?? [], lastRefreshedAt: p.last_refreshed_at,
        createdAt: p.created_at,
        /** Found by a search but not yet looked up in full: the price is a close estimate until the item is opened. */
        estimated: !p.last_refreshed_at,
    };
};

const PAGE_SIZE = 48;
const words = (q: string) => q.replace(/[%,()\\_]/g, ' ').split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 1).slice(0, 5);
const matching = (qb: any, ws: string[]) => ws.reduce((acc, w) => acc.ilike('title', `%${w}%`), qb);

let liveToday = { day: '', n: 0 };

/**
 * Someone searched for something the catalogue barely has: ask the source right now and add what it finds, so the catalogue grows
 * with what people actually look for. Each phrase is asked once a day, and no more than 200 phrases a day.
 */
async function searchOnDemand(phrase: string): Promise<void> {
    const c = Object.values(CONNECTORS).find((x) => x.configured() && x.detailOnDiscover);
    if (!c) return;
    const day = new Date().toISOString().slice(0, 10);
    if (liveToday.day !== day) liveToday = { day, n: 0 };
    if (liveToday.n >= 200 || (c.spareBudget && !c.spareBudget())) return;
    const key = `q:${c.id}:${phrase.toLowerCase()}`.slice(0, 120);
    const { data: seen } = await supabase.from('import_settings').select('value').eq('key', key).maybeSingle();
    if (seen && Date.now() - Date.parse(String(seen.value?.at ?? 0)) < 24 * HOUR) return;
    liveToday.n++;
    try {
        const found = await userFirst(() => c.search(phrase, 40));
        for (const it of found) await savePending(c.id, it, { listed: true });
        const at = new Date().toISOString();
        await supabase.from('import_settings').upsert({ key, value: { at }, updated_at: at });
    } catch (e) { console.error('[Imports] live search failed', phrase, e); }
}

export async function browse(q?: string, category?: string, pageNo?: number) {
    const { settings } = await loadSettings();
    const ws = words(String(q ?? ''));
    const page = Math.max(0, Math.floor(Number(pageNo) || 0));
    const base = () => supabase.from('imported_products').select(PRODUCT_COLS, { count: 'exact' }).eq('is_active', true).eq('listed', true);

    if (ws.length && page === 0 && ws.join(' ').length >= 3) {
        const { count: have, error: e0 } = await matching(supabase.from('imported_products').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('listed', true), ws);
        if (!e0 && (have ?? 0) < 20) await searchOnDemand(ws.join(' '));
    }

    let qb = base();
    if (category) qb = qb.eq('category', category);
    const { data, error, count } = await matching(qb, ws).order('created_at', { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) { if (isTableMissing(error)) return { needsMigration: true, products: [], total: 0, hasMore: false, categories: [] as { name: string; count: number }[], enabled: false }; throw error; }
    const products = ((data ?? []) as any[]).map((p: any) => publicView(p, settings)).filter((p) => p.perItemZmw != null);

    let categories: { name: string; count: number }[] = [];
    if (page === 0 && !ws.length && !category) {
        const { data: cats } = await supabase.from('imported_products').select('category').eq('is_active', true).eq('listed', true).not('category', 'is', null).limit(10000);
        const counts = new Map<string, number>();
        (cats ?? []).forEach((r: any) => counts.set(r.category, (counts.get(r.category) ?? 0) + 1));
        categories = [...counts].map(([name, n]) => ({ name, count: n })).sort((x, y) => y.count - x.count).slice(0, 40);
    }
    return { products, total: count ?? 0, hasMore: (page + 1) * PAGE_SIZE < (count ?? 0), categories, enabled: !!(await importsOrg()), needsMigration: false };
}

/** Upserts what a source returned. New items start listed or not as the caller says; existing ones keep their listed flag. */
async function saveSourceItem(source: string, it: SourceItem, opts: { listed: boolean; category?: string; publish?: boolean }) {
    const now = new Date().toISOString();
    const { data: existing } = await supabase.from('imported_products').select('id').eq('source', source).eq('source_id', it.sourceId).maybeSingle();
    const fields = {
        source_url: it.url || null, title: it.title, description: it.description ?? null, images: it.images, origin: it.origin ?? null, price: it.price, currency: it.currency,
        shipping_price: it.shippingPrice ?? 0, is_active: it.available, last_refreshed_at: now, refresh_error: null, updated_at: now,
        ...(it.weightKg ? { weight_kg: it.weightKg } : {}),
        ...(it.options ? { options: it.options } : {}),
        ...(it.deliveryDays ? { delivery_days_min: it.deliveryDays.min, delivery_days_max: it.deliveryDays.max } : {}),
        ...(opts.publish ? { listed: true } : {}),
    };
    if (existing) {
        const { data } = await supabase.from('imported_products').update(fields).eq('id', existing.id).select(PRODUCT_COLS).single();
        return data;
    }
    const { data, error } = await supabase.from('imported_products').insert({ ...fields, source, source_id: it.sourceId, category: opts.category ?? it.category ?? null, listed: opts.listed }).select(PRODUCT_COLS).single();
    if (error) throw error;
    return data;
}

/**
 * Records an item a search turned up, without looking it up in full (that costs more). It carries the search's price until it is checked,
 * and stays unlisted unless a customer is waiting to see it.
 */
async function savePending(source: string, it: SourceItem, opts: { listed: boolean; category?: string }): Promise<boolean> {
    if (!it.images.length) return false; // a card without a picture looks empty
    const { data: ex } = await supabase.from('imported_products').select('id, listed, last_refreshed_at').eq('source', source).eq('source_id', it.sourceId).maybeSingle();
    if (ex) {
        if (opts.listed && !ex.listed && !ex.last_refreshed_at) await supabase.from('imported_products').update({ listed: true }).eq('id', ex.id);
        return false;
    }
    const { error } = await supabase.from('imported_products').insert({
        source, source_id: it.sourceId, source_url: it.url || null, title: it.title, images: it.images, category: opts.category ?? it.category ?? null, origin: it.origin ?? null,
        price: it.price, currency: it.currency, shipping_price: 0, is_active: true, listed: opts.listed, last_refreshed_at: null,
    });
    return !error;
}

/** Fetches the item from its source again and updates the price, photos and availability. Never throws: a failure is noted on the item. */
export async function refreshProduct(p: any): Promise<void> {
    const c = connectorFor(p.source);
    if (!c || !p.source_id || !c.configured()) return;
    const now = new Date().toISOString();
    const wasPending = !p.last_refreshed_at;
    try {
        const it = await c.fetch(p.source_id);
        if (!it) { await supabase.from('imported_products').update({ is_active: false, last_refreshed_at: now, refresh_error: 'No longer on the source', updated_at: now }).eq('id', p.id); return; }
        // An item found by a search appears in the catalogue once it has been checked in full and can be sent to Zambia.
        await saveSourceItem(p.source, it, { listed: p.listed, publish: wasPending && it.available });
    } catch (e: any) {
        await supabase.from('imported_products').update({ last_refreshed_at: wasPending ? null : now, refresh_error: String(e?.message ?? 'refresh failed').slice(0, 200), updated_at: now }).eq('id', p.id);
    }
}

/**
 * What the catalogue stocks itself with when nobody has set up any searches: everyday things people in Zambia order from overseas. The team
 * can replace this list with their own searches, but nothing has to be added by hand for products to appear.
 */
const STARTER_SEARCHES: { query: string; category: string }[] = [
    ...['wireless earbuds', 'smart watch', 'power bank', 'bluetooth speaker', 'phone holder', 'usb cable', 'charger', 'headphones', 'gaming mouse', 'keyboard', 'webcam', 'tablet case', 'screen protector', 'drone', 'action camera', 'projector', 'router', 'smart plug', 'security camera', 'led monitor'].map((query) => ({ query, category: 'Electronics' })),
    ...['phone case', 'airpods case', 'car phone mount', 'selfie stick', 'ring light', 'tripod'].map((query) => ({ query, category: 'Phone accessories' })),
    ...['LED strip lights', 'kitchen organizer', 'storage box', 'wall clock', 'curtains', 'bed sheets', 'pillow', 'rug', 'wall art', 'vase', 'candle', 'lamp', 'shower curtain', 'towel', 'cutlery set', 'water bottle', 'lunch box', 'air fryer', 'blender', 'electric kettle', 'solar light', 'door mat'].map((query) => ({ query, category: 'Home' })),
    ...['backpack', 'handbag', 'wallet', 'travel bag', 'laptop bag', 'school bag', 'crossbody bag'].map((query) => ({ query, category: 'Bags' })),
    ...['sneakers', 'women dress', 'men jacket', 'hoodie', 't-shirt', 'jeans', 'leggings', 'sandals', 'boots', 'swimwear', 'suit', 'skirt', 'socks', 'cap', 'scarf', 'sunglasses', 'watch men', 'belt', 'school uniform', 'kids clothes', 'sportswear', 'underwear', 'pajamas', 'sweater', 'coat'].map((query) => ({ query, category: 'Fashion' })),
    ...['jewelry necklace', 'earrings', 'bracelet', 'ring', 'anklet'].map((query) => ({ query, category: 'Jewelry' })),
    ...['car accessories', 'car seat cover', 'car vacuum', 'dash cam', 'tyre inflator', 'car led light', 'motorcycle helmet', 'car organizer'].map((query) => ({ query, category: 'Car' })),
    ...['baby toys', 'baby clothes', 'stroller', 'toy car', 'puzzle', 'doll', 'lego blocks', 'baby bottle', 'school supplies', 'kids bicycle'].map((query) => ({ query, category: 'Kids' })),
    ...['skin care', 'hair extensions', 'wig', 'makeup brush', 'lipstick', 'nail polish', 'perfume', 'hair dryer', 'hair straightener', 'beard trimmer', 'face mask', 'shampoo', 'body lotion', 'eyelashes'].map((query) => ({ query, category: 'Beauty' })),
    ...['fitness resistance bands', 'yoga mat', 'dumbbell', 'jump rope', 'football', 'camping tent', 'fishing rod', 'bicycle accessories', 'gym gloves', 'massage gun'].map((query) => ({ query, category: 'Sports' })),
    ...['power tools', 'drill', 'screwdriver set', 'tool box', 'welding', 'garden tools', 'water pump', 'led flood light', 'generator', 'solar panel'].map((query) => ({ query, category: 'Tools' })),
    ...['laptop stand', 'office chair', 'desk organizer', 'notebook', 'printer', 'pen', 'standing desk', 'label maker'].map((query) => ({ query, category: 'Office' })),
    ...['pet bed', 'dog toy', 'cat toy', 'dog leash', 'pet feeder', 'aquarium'].map((query) => ({ query, category: 'Pets' })),
    ...['hair clipper', 'blood pressure monitor', 'thermometer', 'first aid kit', 'massage chair', 'posture corrector'].map((query) => ({ query, category: 'Health' })),
];

/** A search that turned up this many waiting items pauses new searches until the backlog has been checked. */
const BACKLOG_LIMIT = 1500;

export interface SweepLimits { budgetMs?: number; hydrate?: number; refresh?: number; searches?: number }

/**
 * The scheduled work, in this order and within a time budget:
 *   1. check items that searches found (price in full, shipping to Zambia) so they can go live, newest first;
 *   2. refresh items that have gone stale, the popular ones daily and the rest every two weeks;
 *   3. run a few of the saved or starter searches (each once a day, 100 items for 50 points) to find more.
 * It stops early when the source's daily allowance runs low, and steps aside whenever a customer is waiting.
 */
export async function refreshStale(limits: SweepLimits = {}): Promise<{ hydrated: number; refreshed: number; discovered: number; waiting: number }> {
    const deadline = Date.now() + (limits.budgetMs ?? 100_000);
    const result = { hydrated: 0, refreshed: 0, discovered: 0, waiting: 0 };
    const spare = () => Date.now() < deadline && Object.values(CONNECTORS).every((c) => !c.configured() || !c.spareBudget || c.spareBudget());

    const pending = await supabase.from('imported_products').select(PRODUCT_COLS).neq('source', 'MANUAL').eq('is_active', true).is('last_refreshed_at', null).order('created_at', { ascending: false }).limit(limits.hydrate ?? 25);
    if (pending.error) { if (isTableMissing(pending.error)) return result; throw pending.error; }
    for (const p of pending.data ?? []) {
        if (!spare()) break;
        await backgroundTurn();
        await refreshProduct(p); result.hydrated++;
    }

    const old = await supabase.from('imported_products').select(PRODUCT_COLS).neq('source', 'MANUAL').eq('is_active', true).not('last_refreshed_at', 'is', null).order('last_refreshed_at', { ascending: true }).limit((limits.refresh ?? 8) * 4);
    const due = (old.data ?? []).filter((p) => Date.now() - Date.parse(p.last_refreshed_at) > (p.views >= 20 ? 6 : p.views >= 3 ? 24 : 14 * 24) * HOUR).slice(0, limits.refresh ?? 8);
    for (const p of due) {
        if (!spare()) break;
        await backgroundTurn();
        await refreshProduct(p); result.refreshed++;
    }

    const { count: backlog } = await supabase.from('imported_products').select('id', { count: 'exact', head: true }).eq('is_active', true).is('last_refreshed_at', null).neq('source', 'MANUAL');
    result.waiting = backlog ?? 0;
    if (result.waiting < BACKLOG_LIMIT) {
        const { feeds: saved } = await loadSettings();
        const starter: Feed[] = Object.values(CONNECTORS).filter((c) => c.configured() && c.detailOnDiscover).flatMap((c) => STARTER_SEARCHES.map((x) => ({ source: c.id, query: x.query, category: x.category, limit: 100 })));
        const feeds = saved.length ? saved : starter;
        let searches = 0;
        for (const f of feeds) {
            if (searches >= (limits.searches ?? 3) || !spare()) break;
            const c = connectorFor(f.source);
            if (!c?.configured()) continue;
            const key = `feed:${f.source}:${f.query}`.slice(0, 120);
            const { data: last } = await supabase.from('import_settings').select('value').eq('key', key).maybeSingle();
            if (last && Date.now() - Date.parse(String(last.value?.at ?? 0)) < 24 * HOUR) continue;
            searches++;
            try {
                await backgroundTurn();
                for (const found of await c.search(f.query, f.limit ?? 10)) {
                    if (c.detailOnDiscover) { if (await savePending(f.source, found, { listed: false, category: f.category })) result.discovered++; continue; }
                    // A source whose search already returns everything is saved straight away.
                    const { data: had } = await supabase.from('imported_products').select('id').eq('source', f.source).eq('source_id', found.sourceId).maybeSingle();
                    if (had || !found.available || !found.images.length) continue;
                    await saveSourceItem(f.source, found, { listed: true, category: f.category });
                    result.discovered++;
                }
                await supabase.from('import_settings').upsert({ key, value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() });
            } catch (e) { console.error('[Imports] search failed', f, e); }
        }
    }
    return result;
}

let sweeping = false;
/**
 * Started once by the API. A sweep checks what searches found, refreshes what is stale and finds more, never two at the same time. While
 * items are waiting to be checked it runs every 2 minutes; once caught up, every 20.
 */
export function startImportRefresh(): void {
    if (process.env.IMPORT_REFRESH_DISABLED === 'true') return;
    const run = async () => {
        let next = 20 * 60_000;
        if (!sweeping && Object.values(CONNECTORS).some((c) => c.configured())) {
            sweeping = true;
            try {
                const r = await refreshStale({ budgetMs: 100_000, hydrate: 40, refresh: 8, searches: 3 });
                if (r.hydrated || r.refreshed || r.discovered) console.log(`[Imports] checked ${r.hydrated} new, refreshed ${r.refreshed}, found ${r.discovered}, ${r.waiting} waiting`);
                if (r.waiting > 0 || r.discovered > 0) next = 2 * 60_000;
            } catch (e) { console.error('[Imports] refresh sweep failed', e); }
            finally { sweeping = false; }
        }
        setTimeout(run, next).unref?.();
    };
    setTimeout(run, 15_000).unref?.();
}

/* ───────────── One item, its price and checkout ───────────── */

export interface Ctx { userId: string; orgId: string; role: string; name: string }

export async function importsOrg(): Promise<{ orgId: string; username: string; userId: string } | null> {
    const username = String(process.env.IMPORT_ORG_USERNAME ?? '').trim().replace(/^@/, '');
    const orgId = String(process.env.IMPORT_ORG_ID ?? '').trim();
    const userId = String(process.env.IMPORT_ADMIN_USER_ID ?? '').trim();
    if (!username || !orgId || !userId) return null;
    const { data } = await supabase.from('organizations').select('id, lenco_subaccount_id').eq('id', orgId).maybeSingle();
    return data?.lenco_subaccount_id ? { orgId, username, userId } : null;
}

async function loadProduct(id: string): Promise<any> {
    const { data, error } = await supabase.from('imported_products').select(PRODUCT_COLS).eq('id', id).maybeSingle();
    if (error) { if (isTableMissing(error)) throw new ImportError('Imported products are opening soon.', 409, 'NOT_ENABLED'); throw error; }
    if (!data || !data.is_active) throw new ImportError('This item isn’t available any more.', 404, 'NOT_FOUND');
    return data;
}

/** The item with what it costs for this quantity, and the buyer's wallets. Opening an item also refreshes it when it's gone stale. */
export async function quoteImport(ctx: Ctx, input: { id: string; quantity?: number }) {
    let p = await loadProduct(input.id);
    void supabase.from('imported_products').update({ views: (p.views ?? 0) + 1 }).eq('id', p.id).then(() => undefined, () => undefined);
    if (p.source !== 'MANUAL' && (!p.last_refreshed_at || Date.now() - Date.parse(p.last_refreshed_at) > HOUR)) {
        await Promise.race([userFirst(() => refreshProduct(p)), new Promise((r) => setTimeout(r, 7000))]);
        p = await loadProduct(input.id);
    }
    const { settings } = await loadSettings();
    const quantity = Math.min(20, Math.max(1, Math.floor(Number(input.quantity) || 1)));
    let quote;
    try { quote = priceImport(p, quantity, settings); } catch (e) { if (e instanceof PricingError) throw new ImportError(e.message, 409, 'NO_RATE'); throw e; }
    return {
        enabled: !!(await importsOrg()),
        product: { ...publicView(p, settings), sourceUrl: p.source_url },
        quote,
        taxNote: `Import duty and VAT are estimated at ${settings.pricing.dutyPercent}% and ${settings.pricing.vatPercent}%. They’re included now, so nothing is added when it arrives.`,
        wallets: await payLinkService.payerWallets(ctx.orgId),
    };
}

/** A customer pastes a link: if it's from a source we can read, the item is fetched and made available (unlisted) to order. */
export async function importFromLink(url: string) {
    const hit = connectorForUrl(String(url ?? '').trim());
    if (!hit) throw new ImportError('We can’t read links from that store yet. Paste an eBay or CJ Dropshipping item link, or browse what’s here.', 400, 'UNSUPPORTED_LINK');
    if (!hit.connector.configured()) throw new ImportError(`${hit.connector.label} items are opening soon.`, 409, 'NOT_ENABLED');
    let it: SourceItem | null;
    try { it = await userFirst(() => hit.connector.fetch(hit.sourceId)); } catch { throw new ImportError(`We couldn’t reach ${hit.connector.label} just now. Try again in a minute.`, 502, 'SOURCE_DOWN'); }
    if (!it) throw new ImportError('That item has ended or been removed.', 404, 'GONE');
    const row = await saveSourceItem(hit.connector.id, it, { listed: false });
    if (!row) throw new ImportError('We couldn’t save that item. Try again.', 500, 'SAVE');
    return { id: row.id as string };
}

/* ───────────── Orders ───────────── */

export interface PlaceInput { productId: string; quantity?: number; optionNote?: string; phone?: string; area?: string; address?: string; notes?: string; walletId?: string; idempotencyKey?: string }

export async function placeImportOrder(ctx: Ctx, input: PlaceInput) {
    if (ctx.role !== 'ADMIN') throw new ImportError('Only the account holder can pay from this wallet.', 403, 'FORBIDDEN');
    const org = await importsOrg();
    if (!org) throw new ImportError('Imported products are opening soon.', 409, 'NOT_ENABLED');
    if (org.orgId === ctx.orgId) throw new ImportError('This is the imports account itself.', 400, 'OWN');

    const key = String(input.idempotencyKey ?? '').trim() || null;
    if (key) {
        const { data: prior } = await supabase.from('import_orders').select('*').eq('idempotency_key', key).maybeSingle();
        if (prior) { if (prior.buyer_user_id !== ctx.userId) throw new ImportError('That request isn’t yours.', 403, 'FORBIDDEN'); return prior; }
    }
    const q = await quoteImport(ctx, { id: input.productId, quantity: input.quantity });
    const phone = String(input.phone ?? '').trim().slice(0, 20);
    const address = String(input.address ?? '').trim().slice(0, 300);
    if (!phone) throw new ImportError('Add a phone number so we can reach you.', 400, 'PHONE');
    if (!address) throw new ImportError('Add where we should bring it.', 400, 'ADDRESS');
    const wallet = input.walletId ? q.wallets.find((w) => w.id === input.walletId) : q.wallets.find((w) => w.is_main) ?? q.wallets[0];
    if (!wallet) throw new ImportError('Choose one of your wallets to pay from.', 400, 'WALLET');
    const total = q.quote.totalZmw;
    if (wallet.balance + 0.005 < total) throw new ImportError(`${wallet.name} has K${wallet.balance.toFixed(2)} but this needs K${total.toFixed(2)}. Add money or choose another wallet.`, 402, 'INSUFFICIENT');

    const p = await loadProduct(input.productId);
    const { data: row, error } = await supabase.from('import_orders').insert({
        product_id: p.id, buyer_user_id: ctx.userId, buyer_org_id: ctx.orgId, buyer_name: ctx.name, buyer_phone: phone,
        title: p.title, image_url: (p.images ?? [])[0] ?? null, source: p.source, source_url: p.source_url, quantity: q.quote.quantity,
        option_note: String(input.optionNote ?? '').trim().slice(0, 200) || null, unit_price: p.price, currency: p.currency, fx_rate: q.quote.rate,
        item_zmw: q.quote.itemZmw, shipping_zmw: q.quote.shippingZmw, taxes_zmw: q.quote.taxesZmw, fee_zmw: q.quote.feeZmw, total_zmw: total,
        delivery_area: String(input.area ?? '').trim().slice(0, 80) || null, delivery_address: address, notes: String(input.notes ?? '').trim().slice(0, 300) || null,
        status: 'PENDING_PAYMENT', idempotency_key: key,
    }).select('*').single();
    if (error || !row) throw error ?? new Error('order not saved');

    try {
        const paid = await payLinkService.payWithWallet(
            { organizationId: ctx.orgId, userId: ctx.userId, role: ctx.role, today: new Date().toISOString().split('T')[0] },
            { username: org.username, amount: total, purpose: `Import order · ${p.title}`.slice(0, 120), walletId: wallet.id },
        );
        const confirmed = paid.status === 'paid';
        const events = [{ at: new Date().toISOString(), status: confirmed ? 'PAID' : 'PAYMENT_PROCESSING', note: STATUS_TEXT.PAID }];
        const { data: updated } = await supabase.from('import_orders').update({
            status: confirmed ? 'PAID' : 'PAYMENT_PROCESSING', payment_reference: paid.reference, requisition_id: paid.requisitionId, paid_at: confirmed ? new Date().toISOString() : null,
            events, updated_at: new Date().toISOString(),
        }).eq('id', row.id).select('*').single();
        void notifySeller(org.orgId, { title: 'New import order', path: '/', body: `${ctx.name} paid K${total.toFixed(2)} for ${p.title}${q.quote.quantity > 1 ? ` ×${q.quote.quantity}` : ''}. Buy it at the source, then add the order and tracking numbers in the admin.` });
        void notifyUser(ctx.userId, { title: 'Order received', path: '/marketplace/imported/orders', body: `We have your payment of K${total.toFixed(2)} for ${p.title} and will buy it now. You can follow it in your import orders.` });
        return updated;
    } catch (e: any) {
        await supabase.from('import_orders').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', row.id);
        if (e instanceof PayLinkError) throw new ImportError(e.message, e.httpStatus, e.code);
        throw e;
    }
}

export async function myImportOrders(userId: string) {
    const { data, error } = await supabase.from('import_orders').select('*').eq('buyer_user_id', userId).not('status', 'in', '(PENDING_PAYMENT,FAILED)').order('created_at', { ascending: false }).limit(100);
    if (error) { if (isTableMissing(error)) return []; throw error; }
    return data ?? [];
}

/* ───────────── The team: purchasing queue, tracking, cancelling ───────────── */

export async function queue(status?: string) {
    let q = supabase.from('import_orders').select('*').not('status', 'in', '(PENDING_PAYMENT,FAILED)').order('created_at', { ascending: false }).limit(200);
    if (status && status !== 'ALL') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) { if (isTableMissing(error)) return []; throw error; }
    return data ?? [];
}

/** Records what happened to an order: its status, the supplier's order number, the tracking number and carrier. The buyer is told of every change of status. */
export async function updateOrder(id: string, patch: { status?: string; supplierOrderRef?: string; trackingNumber?: string; carrier?: string; note?: string }, by: string) {
    const { data: o } = await supabase.from('import_orders').select('*').eq('id', id).maybeSingle();
    if (!o) throw new ImportError('Order not found.', 404, 'NOT_FOUND');
    if (['CANCELLED', 'REFUNDED', 'DELIVERED'].includes(o.status)) throw new ImportError('This order is finished.', 409, 'DONE');
    if (['PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'FAILED'].includes(o.status)) throw new ImportError('This order hasn’t been paid yet.', 409, 'NOT_PAID');
    if (patch.status && !(STATUSES as readonly string[]).includes(patch.status)) throw new ImportError('That isn’t a status.', 400, 'STATUS');
    if (patch.status === 'CANCELLED') throw new ImportError('Use cancel and refund for that.', 400, 'STATUS');

    const changes: any = { updated_at: new Date().toISOString() };
    if (patch.supplierOrderRef !== undefined) changes.supplier_order_ref = String(patch.supplierOrderRef).trim().slice(0, 100) || null;
    if (patch.trackingNumber !== undefined) changes.tracking_number = String(patch.trackingNumber).trim().slice(0, 100) || null;
    if (patch.carrier !== undefined) changes.carrier = String(patch.carrier).trim().slice(0, 60) || null;
    const statusChanged = !!patch.status && patch.status !== o.status;
    const note = String(patch.note ?? '').trim().slice(0, 200);
    if (statusChanged) changes.status = patch.status;
    if (statusChanged || note) changes.events = [...(o.events ?? []), { at: changes.updated_at, status: patch.status ?? o.status, note: note || (statusChanged ? STATUS_TEXT[patch.status!] : ''), by }];
    const { data } = await supabase.from('import_orders').update(changes).eq('id', id).select('*').single();
    if (statusChanged) void notifyUser(o.buyer_user_id, { title: 'Your import order was updated', path: '/marketplace/imported/orders', body: `${o.title}: ${STATUS_TEXT[patch.status!] ?? 'updated'}.${data?.tracking_number ? ` Tracking ${data.tracking_number}${data.carrier ? ` (${data.carrier})` : ''}.` : ''}` });
    return data;
}

/** Pays the buyer back from the imports account and closes the order. */
export async function cancelAndRefund(id: string, reason: string, by: string) {
    const org = await importsOrg();
    if (!org) throw new ImportError('Refunds are paused: the imports account isn’t set up.', 409, 'NOT_ENABLED');
    const { data: o } = await supabase.from('import_orders').select('*').eq('id', id).maybeSingle();
    if (!o) throw new ImportError('Order not found.', 404, 'NOT_FOUND');
    if (!['PAID', 'ORDERED', 'SHIPPED', 'IN_TRANSIT', 'CUSTOMS', 'IN_LUSAKA'].includes(o.status) || o.refunded_at) throw new ImportError('This order can’t be cancelled.', 409, 'NOT_CANCELLABLE');
    const { data: buyer } = o.buyer_org_id ? await supabase.from('organizations').select('public_username, lenco_subaccount_id').eq('id', o.buyer_org_id).maybeSingle() : { data: null as any };
    if (!buyer?.public_username || !buyer?.lenco_subaccount_id) throw new ImportError('The buyer’s wallet can’t receive a refund automatically. Refund them by hand, then record it here.', 409, 'BUYER_UNREACHABLE');
    // Claim first so a double click can't pay twice.
    const { data: claimed } = await supabase.from('import_orders').update({ refunded_at: new Date().toISOString() }).eq('id', id).is('refunded_at', null).select('id').maybeSingle();
    if (!claimed) throw new ImportError('A refund for this order is already in progress.', 409, 'IN_PROGRESS');
    try {
        const paid = await payLinkService.payWithWallet(
            { organizationId: org.orgId, userId: org.userId, role: 'ADMIN', today: new Date().toISOString().split('T')[0] },
            { username: buyer.public_username, amount: round2(Number(o.total_zmw)), purpose: `Import refund · ${o.title}`.slice(0, 120) },
        );
        const at = new Date().toISOString();
        const { data } = await supabase.from('import_orders').update({
            status: 'CANCELLED', refund_reference: paid.reference, events: [...(o.events ?? []), { at, status: 'CANCELLED', note: String(reason ?? '').trim().slice(0, 200) || STATUS_TEXT.CANCELLED, by }], updated_at: at,
        }).eq('id', id).select('*').single();
        void notifyUser(o.buyer_user_id, { title: 'Order cancelled and refunded', path: '/marketplace/imported/orders', body: `${o.title}: K${Number(o.total_zmw).toFixed(2)} was sent back to your wallet.${reason ? ` ${reason}` : ''}` });
        return data;
    } catch (e: any) {
        await supabase.from('import_orders').update({ refunded_at: null }).eq('id', id);
        if (e instanceof PayLinkError) throw new ImportError(e.message, e.httpStatus, e.code);
        throw e;
    }
}

/* ───────────── The team: catalogue ───────────── */

export async function adminProducts() {
    const { data, error } = await supabase.from('imported_products').select(PRODUCT_COLS).order('created_at', { ascending: false }).limit(300);
    if (error) { if (isTableMissing(error)) return []; throw error; }
    return data ?? [];
}

const cleanImages = (x: unknown): string[] => (Array.isArray(x) ? x : String(x ?? '').split(/\s+/)).map((s) => String(s).trim()).filter((s) => /^https?:\/\//.test(s)).slice(0, 8);

/** Adds or edits an item by hand (also how the first products go in before any source is connected). */
export async function saveManualProduct(id: string | null, b: any) {
    const price = Number(b.price);
    const title = String(b.title ?? '').trim();
    if (!id && (!title || !(price >= 0))) throw new ImportError('A title and a price are needed.', 400, 'FIELDS');
    const fields: any = { updated_at: new Date().toISOString() };
    if (b.title !== undefined) fields.title = title.slice(0, 200);
    if (b.description !== undefined) fields.description = String(b.description ?? '').slice(0, 1500) || null;
    if (b.images !== undefined) fields.images = cleanImages(b.images);
    if (b.category !== undefined) fields.category = String(b.category ?? '').trim().slice(0, 60) || null;
    if (b.origin !== undefined) fields.origin = String(b.origin ?? '').trim().slice(0, 40) || null;
    if (b.price !== undefined) { if (!(price >= 0)) throw new ImportError('The price isn’t a number.', 400, 'FIELDS'); fields.price = price; }
    if (b.currency !== undefined) fields.currency = String(b.currency).toUpperCase().slice(0, 3);
    if (b.shippingPrice !== undefined) fields.shipping_price = Math.max(0, Number(b.shippingPrice) || 0);
    if (b.weightKg !== undefined) fields.weight_kg = Number(b.weightKg) > 0 ? Number(b.weightKg) : null;
    if (b.deliveryDaysMin !== undefined) fields.delivery_days_min = Math.max(1, Math.floor(Number(b.deliveryDaysMin) || 14));
    if (b.deliveryDaysMax !== undefined) fields.delivery_days_max = Math.max(1, Math.floor(Number(b.deliveryDaysMax) || 28));
    if (b.sourceUrl !== undefined) fields.source_url = /^https?:\/\//.test(String(b.sourceUrl)) ? String(b.sourceUrl) : null;
    if (b.isActive !== undefined) fields.is_active = !!b.isActive;
    if (b.listed !== undefined) fields.listed = !!b.listed;
    if (id) {
        const { data, error } = await supabase.from('imported_products').update(fields).eq('id', id).select(PRODUCT_COLS).single();
        if (error) throw error;
        return data;
    }
    const { data, error } = await supabase.from('imported_products').insert({ source: 'MANUAL', currency: 'USD', ...fields, last_refreshed_at: new Date().toISOString() }).select(PRODUCT_COLS).single();
    if (error) throw error;
    return data;
}

export async function adminSearch(source: string, q: string) {
    const c = connectorFor(source);
    if (!c) throw new ImportError('Unknown source.', 400, 'SOURCE');
    if (!c.configured()) throw new ImportError(`${c.label} isn’t connected yet. Set its keys in the API settings.`, 409, 'NOT_CONFIGURED');
    return c.search(String(q ?? '').trim(), 20);
}

export async function adminAddFromSource(source: string, sourceId: string, category?: string) {
    const c = connectorFor(source);
    if (!c?.configured()) throw new ImportError('That source isn’t connected yet.', 409, 'NOT_CONFIGURED');
    const it = await c.fetch(sourceId);
    if (!it) throw new ImportError('That item is no longer there.', 404, 'GONE');
    return saveSourceItem(source, it, { listed: true, category });
}

export async function adminRefresh(id: string) {
    const { data } = await supabase.from('imported_products').select(PRODUCT_COLS).eq('id', id).maybeSingle();
    if (!data) throw new ImportError('Item not found.', 404, 'NOT_FOUND');
    await refreshProduct(data);
    const { data: after } = await supabase.from('imported_products').select(PRODUCT_COLS).eq('id', id).single();
    return after;
}

export const connectorStatus = () => Object.values(CONNECTORS).map((c) => ({ id: c.id, label: c.label, configured: c.configured() }));

/**
 * Store pages as a source. There is no key or API: the connector opens a product page the way a browser would and reads the price the
 * store publishes in the page for search engines (JSON-LD), falling back to Amazon's buy-box and the page's own tags.
 *
 * Two kinds of source id:
 *   - a store address (https://www.apple.com/shop/buy-iphone/iphone-16): that one page is the price;
 *   - "w:<slug>": an entry on the watchlist (import_settings "watch"), which lists several store pages for one product. Its market price
 *     is the median of what those stores charge, so one cheap or overpriced seller doesn't set the price.
 *
 * Reading pages is against some stores' terms and they change or block pages without notice, so it is kept gentle: only listed stores,
 * one request at a time per store with a pause between, and every failure is just a missing price that the next sweep tries again.
 */
import { supabase } from '../../lib/supabase';
import type { Connector, SourceItem } from './sources';

/** Stores the connector will open. Anything else is refused, so a pasted link can't make the server fetch arbitrary addresses. */
const STORES: Record<string, string> = {
    'apple.com': 'Apple', 'amazon.com': 'Amazon', 'bestbuy.com': 'Best Buy', 'walmart.com': 'Walmart', 'target.com': 'Target',
    'bhphotovideo.com': 'B&H', 'newegg.com': 'Newegg', 'meta.com': 'Meta', 'samsung.com': 'Samsung', 'store.google.com': 'Google Store',
    'ebay.com': 'eBay', 'microcenter.com': 'Micro Center', 'gamestop.com': 'GameStop', 'zappos.com': 'Zappos', 'beforward.jp': 'BE FORWARD', 'sony.com': 'Sony', 'bose.com': 'Bose', 'garmin.com': 'Garmin', 'anker.com': 'Anker', 'motorola.com': 'Motorola',
};
const storeOf = (host: string): string | null => {
    const h = host.toLowerCase();
    const key = Object.keys(STORES).find((k) => h === k || h.endsWith(`.${k}`));
    return key ?? null;
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const GAP_MS = 4_000;
const GAP_BY_STORE: Record<string, number> = { 'amazon.com': 6_000 };
const lastHit = new Map<string, number>();
const queues = new Map<string, Promise<unknown>>();
/** One request at a time per store, with a pause after the previous one. */
const politely = <T,>(store: string, fn: () => Promise<T>): Promise<T> => {
    const run = (queues.get(store) ?? Promise.resolve()).then(async () => {
        const wait = (lastHit.get(store) ?? 0) + (GAP_BY_STORE[store] ?? GAP_MS) - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        try { return await fn(); } finally { lastHit.set(store, Date.now()); }
    });
    queues.set(store, run.catch(() => undefined));
    return run;
};

/** The name a buyer knows a store by, from a product address. */
export const storeLabel = (url: string | null | undefined): string | null => {
    try { const k = storeOf(new URL(String(url)).hostname); return k ? STORES[k] : null; } catch { return null; }
};
/** The address fragment that identifies a store's products, for filtering the catalogue by store. */
export const storeHost = (label: string): string | null => Object.entries(STORES).find(([, l]) => l === label)?.[0] ?? null;

/**
 * Brand stores that list their whole range on a few category pages. Each entry is one such page and the pattern of a product's address on
 * it, so the range can be found without anyone listing products by hand.
 */
const BRAND_FEEDS: Record<string, { list: string; re: RegExp; category: string }> = {
    'samsung-phones': { list: 'https://www.samsung.com/us/smartphones/all-smartphones/', re: /^https:\/\/www\.samsung\.com\/us\/(?:smartphones|tablets|watches)\/[a-z0-9-]+\/buy\/$/, category: 'Phones' },
    'samsung-tablets': { list: 'https://www.samsung.com/us/tablets/all-tablets/', re: /^https:\/\/www\.samsung\.com\/us\/(?:smartphones|tablets|watches)\/[a-z0-9-]+\/buy\/$/, category: 'Tablets' },
    'samsung-watches': { list: 'https://www.samsung.com/us/watches/all-watches/', re: /^https:\/\/www\.samsung\.com\/us\/(?:smartphones|tablets|watches)\/[a-z0-9-]+\/buy\/$/, category: 'Watches' },
    'sony-headphones': { list: 'https://electronics.sony.com/audio/headphones/c/all-headphones', re: /^https:\/\/electronics\.sony\.com\/[a-z0-9/-]+\/p\/[a-z0-9-]+$/, category: 'Audio' },
    'sony-speakers': { list: 'https://electronics.sony.com/audio/speakers/c/all-speakers', re: /^https:\/\/electronics\.sony\.com\/[a-z0-9/-]+\/p\/[a-z0-9-]+$/, category: 'Audio' },
    'bose-headphones': { list: 'https://www.bose.com/c/headphones', re: /^https:\/\/www\.bose\.com\/p\/[^\s?]+\.html$/, category: 'Audio' },
    'bose-speakers': { list: 'https://www.bose.com/c/speakers', re: /^https:\/\/www\.bose\.com\/p\/[^\s?]+\.html$/, category: 'Audio' },
    'garmin-watches': { list: 'https://www.garmin.com/en-US/c/wearables-smartwatches/', re: /^https:\/\/www\.garmin\.com\/en-US\/p\/\d+\/$/, category: 'Watches' },
    'anker-power-banks': { list: 'https://www.anker.com/collections/power-banks', re: /^https:\/\/www\.anker\.com\/products\/[a-z0-9-]+$/, category: 'Phone accessories' },
    'anker-chargers': { list: 'https://www.anker.com/collections/chargers', re: /^https:\/\/www\.anker\.com\/products\/[a-z0-9-]+$/, category: 'Phone accessories' },
    'motorola-phones': { list: 'https://www.motorola.com/us/smartphones', re: /^https:\/\/www\.motorola\.com\/us\/en\/p\/[a-z0-9]+$/, category: 'Phones' },
};
const titleFromAddress = (u: string) => decode(u.replace(/[?#].*$/, '').replace(/\/(?:buy|)\/?$/, '').split('/').filter(Boolean).pop()?.replace(/\.html$/, '').replace(/[-_]+/g, ' ') ?? 'Product').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 120);

/** The products on one brand category page, as candidates to be read in full. */
export async function brandList(key: string): Promise<SourceItem[]> {
    const feed = BRAND_FEEDS[key];
    if (!feed) return [];
    const store = storeOf(new URL(feed.list).hostname)!;
    const res = await politely(store, () => getWithRetry(feed.list));
    if (!res.ok) throw new Error(`${STORES[store]} answered ${res.status}`);
    const html = await res.text();
    const urls = new Set<string>();
    for (const m of html.matchAll(/href="([^"#]+)"/g)) {
        try {
            const u = new URL(m[1].replace(/&amp;/g, '&'), feed.list); u.search = '';
            const clean = u.toString();
            if (feed.re.test(clean)) urls.add(clean);
        } catch { /* not an address */ }
    }
    return [...urls].slice(0, 40).map((url) => ({ sourceId: url, url, title: `${STORES[store]} ${titleFromAddress(url)}`, images: [], category: feed.category, origin: 'USA', price: 0, currency: 'USD', available: true }));
}

/** Opens an address like a browser would. A dropped connection is retried twice before it counts as a failure. */
async function getWithRetry(url: string): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
        try { return await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(25_000) }); }
        catch (e) { lastError = e; if (attempt < 2) await new Promise((r) => setTimeout(r, 3_000 * (attempt + 1))); }
    }
    throw lastError instanceof Error ? lastError : new Error('The store didn’t answer');
}

export interface PageRead { title: string; price: number | null; currency: string; images: string[]; available: boolean; description?: string; specs?: Record<string, unknown> }

const num = (s: unknown): number | null => {
    const n = Number(String(s ?? '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
};
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const httpsOnly = (xs: unknown[]): string[] => [...new Set(xs.map((x) => String(x ?? '')).filter((x) => /^https:\/\//.test(x)))];

/** Pulls what it can out of a page's text. Pure, so it can be tested without the network. */
export function readPage(html: string, host: string): PageRead {
    const out: PageRead = { title: '', price: null, currency: 'USD', images: [], available: true };

    // 1. JSON-LD: what the store tells search engines.
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
        let data: unknown;
        try { data = JSON.parse(m[1]); } catch { continue; }
        const walk = (x: any, depth = 0): void => {
            if (!x || typeof x !== 'object' || depth > 8) return;
            if (Array.isArray(x)) { x.forEach((y) => walk(y, depth + 1)); return; }
            if (/(^|,)Product(,|$)/.test([].concat(x['@type'] ?? []).join(','))) {
                if (!out.title && x.name) out.title = String(x.name);
                if (!out.description && x.description) out.description = String(x.description);
                out.images.push(...httpsOnly([].concat(x.image ?? []).map((i: any) => (typeof i === 'string' ? i : i?.url))));
                for (const o of ([] as any[]).concat(x.offers ?? [])) {
                    const prices = [o?.price, o?.lowPrice, o?.priceSpecification?.price].map(num).filter((n): n is number => n !== null);
                    if (prices.length && out.price === null) { out.price = prices[0]; out.currency = String(o.priceCurrency ?? 'USD').toUpperCase(); }
                    if (/OutOfStock|SoldOut|Discontinued/i.test(String(o?.availability ?? ''))) out.available = false;
                    for (const sub of ([] as any[]).concat(o?.offers ?? [])) { const n = num(sub?.price); if (n !== null && out.price === null) out.price = n; }
                }
            }
            Object.values(x).forEach((y) => walk(y, depth + 1));
        };
        walk(data);
    }

    // 2. Amazon: the price in the buy box, not the first price anywhere on the page (bundles and accessories show up all over it).
    if (/(^|\.)amazon\./i.test(host)) {
        if (!out.title) out.title = decode(html.match(/id="productTitle"[^>]*>\s*([^<]+)/)?.[1] ?? '');
        if (out.price === null) {
            const core = html.match(/id="corePrice_feature_div"[\s\S]{0,3000}?a-offscreen">\s*\$([0-9,]+\.\d{2})\s*</)
                ?? html.match(/class="a-section a-spacing-none aok-align-center[\s\S]{0,1500}?a-offscreen">\s*\$([0-9,]+\.\d{2})\s*</)
                ?? html.match(/id="(?:apex_desktop|corePriceDisplay_desktop_feature_div)"[\s\S]{0,3000}?a-offscreen">\s*\$([0-9,]+\.\d{2})\s*</);
            out.price = core ? num(core[1]) : null;
        }
        if (/id="outOfStock"|Currently unavailable/i.test(html) && out.price === null) out.available = false;
        const hi = [...html.matchAll(/"hiRes":"(https:[^"]+)"/g)].map((m) => m[1]);
        out.images.push(...hi);
    }

    // A car dealer's vehicle page: the specs and the price delivered to the port.
    if (/(^|\.)beforward\./i.test(host)) readCar(html, out);

    // 3. The page's own tags.
    if (!out.title) out.title = decode(html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] ?? html.match(/<title>([^<]+)/i)?.[1] ?? '');
    if (out.price === null) {
        const p = html.match(/(?:product|og):price:amount"\s+content="([^"]+)"/i)?.[1];
        out.price = num(p);
        const c = html.match(/(?:product|og):price:currency"\s+content="([^"]+)"/i)?.[1];
        if (c) out.currency = c.toUpperCase();
    }
    const og = html.match(/property="og:image"\s+content="(https:[^"]+)"/i)?.[1];
    if (og) out.images.push(og);
    out.images = httpsOnly(out.images.map(decode)).slice(0, 8);
    out.title = out.title.replace(/\s+/g, ' ').trim().slice(0, 200);
    return out;
}

/** BE FORWARD vehicle page: year, mileage, engine size, steering and the dealer's price delivered to a port. */
function readCar(html: string, out: PageRead): void {
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&times;/g, 'x').replace(/\s+/g, ' ');
    const g = (re: RegExp) => text.match(re)?.[1]?.trim();
    const head = text.match(/([\d,]+)\s*km\s+(\d{4})\/\d+\s+([\d,]+)\s*cc\s+(\w+)\s+(\w+)\s+Ref\. No/);
    const cnf = text.match(/Total Price\s*\$\s*([\d,]+)\s+(?:Inspect \+ Cert )?(?:to|CNF)\s+([A-Za-z ]+?)(?:\s+Earn|\s+Limited|\s+GET|$)/i);
    const specs: Record<string, unknown> = {
        year: head ? Number(head[2]) : num(g(/Registration Year\/month\s+(\d{4})/)),
        mileageKm: head ? num(head[1]) : num(g(/Mileage\s+([\d,]+)\s*km/i)),
        engineCc: head ? num(head[3]) : num(g(/Engine Size\s+([\d,]+)\s*cc/i)),
        transmission: g(/Transmission\s+(Automatic|Manual|CVT|[A-Za-z]+)\s+(?:M3|Registration|Dimension)/) ?? head?.[4],
        fuel: g(/Fuel\s+(Petrol|Diesel|Hybrid|Electric|LPG|[A-Za-z]+)\s+Version/) ?? head?.[5],
        steering: g(/Steering\s+(Right|Left)/),
        drive: g(/Drive\s+(\dwheel drive)/),
        doors: num(g(/Doors\s+(\d+)/)),
        seats: num(g(/Seats\s+(\d+)/)),
        weightKg: num(g(/Weight\s+([\d,]+)\s*kg/i)),
        color: g(/Ext\. Color\s+([A-Za-z ]+?)\s+Location/),
        stockLocation: g(/Location\s+([A-Za-z ]+?)\s+Fuel/),
        ref: g(/Ref\. No\.?\s+([A-Z0-9]+)/),
        cnfUsd: cnf ? num(cnf[1]) : null,
        port: cnf ? cnf[2].trim() : null,
    };
    if (specs.engineCc) out.specs = specs;
    const t = html.match(/<title>\s*(?:Used\s+)?(.+?)\s+for Sale\b/i)?.[1];
    if (t) out.title = decode(t);
}

/** One page of BE FORWARD's stock list (25 cars), as candidates to be read in full. */
export async function carList(page: number): Promise<SourceItem[]> {
    const html = await politely('beforward.jp', async () => {
        const res = await getWithRetry(`https://www.beforward.jp/stocklist/${page > 1 ? `page=${page}/` : ''}`);
        if (!res.ok) throw new Error(`BE FORWARD answered ${res.status}`);
        return res.text();
    });
    const out = new Map<string, SourceItem>();
    for (const row of html.split('class="stocklist-row').slice(1)) {
        const path = row.match(/href="(\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9]+\/id\/\d+\/)"/i)?.[1];
        const src = row.match(/<img src="(\/\/image-cdn\.beforward\.jp\/[^"]+)"\s+alt="([^"]+)"/i);
        const price = num(row.match(/class="price">\$([\d,]+)/)?.[1]);
        if (!path || !src || out.has(path)) continue;
        const url = `https://www.beforward.jp${path}`;
        out.set(path, { sourceId: url, url, title: decode(src[2]).slice(0, 200), images: [`https:${src[1]}`.replace('/medium/', '/large/').replace(/\?w=\d+$/, '')], category: 'Cars', origin: 'Japan', price: price ?? 0, currency: 'USD', available: true });
    }
    return [...out.values()];
}

async function openPage(url: string): Promise<PageRead> {
    const u = new URL(url);
    const store = storeOf(u.hostname);
    if (u.protocol !== 'https:' || !store) throw new Error('That store isn’t on the list.');
    return politely(store, async () => {
        // A dropped connection is retried twice before it counts as a failure.
        let res: Response | undefined;
        for (let attempt = 0; attempt < 3 && !res; attempt++) {
            try { res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) }); }
            catch (e) { if (attempt === 2) throw e; await new Promise((r) => setTimeout(r, 3_000 * (attempt + 1))); }
        }
        if (!res) throw new Error(`${STORES[store]} didn’t answer`);
        if (res.status === 404 || res.status === 410) return { title: '', price: null, currency: 'USD', images: [], available: false };
        if (!res.ok) throw new Error(`${STORES[store]} answered ${res.status}`);
        const html = await res.text();
        if (/captcha|robot check|api-services-support/i.test(html.slice(0, 20_000)) && html.length < 50_000) throw new Error(`${STORES[store]} asked for a robot check`);
        return readPage(html, u.hostname);
    });
}

/** The middle price, ignoring any that is far from the rest (a bundle, an accessory, a seller with a mistake). */
export function marketPrice(prices: number[]): number | null {
    const p = prices.filter((x) => x > 0).sort((a, b) => a - b);
    if (!p.length) return null;
    const mid = (xs: number[]) => (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2);
    const m = mid(p);
    if (p.length < 3) return p.length === 2 && p[1] / p[0] > 1.35 ? p[0] : Math.round(m * 100) / 100; // two stores far apart: believe the lower
    const kept = p.filter((x) => x >= m * 0.6 && x <= m * 1.6);
    return Math.round(mid(kept.length ? kept : p) * 100) / 100;
}

export interface WatchEntry { slug: string; title: string; category?: string; weightKg?: number; urls: string[]; minUsd?: number; maxUsd?: number; description?: string; image?: string }

export async function loadWatchlist(): Promise<WatchEntry[]> {
    const { data } = await supabase.from('import_settings').select('value').eq('key', 'watch').maybeSingle();
    return Array.isArray(data?.value) ? (data!.value as WatchEntry[]) : [];
}

/** Canonical address for a store page, so the same product pasted twice is one item. */
export function normaliseUrl(raw: string): string | null {
    try {
        const u = new URL(raw);
        if (u.protocol !== 'https:' || !storeOf(u.hostname)) return null;
        if (/(^|\.)beforward\./i.test(u.hostname)) {
            return /^\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9]+\/id\/\d+\/?$/i.test(u.pathname) ? `https://www.beforward.jp${u.pathname.replace(/\/?$/, '/')}` : null;
        }
        if (/(^|\.)amazon\./i.test(u.hostname)) {
            const asin = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1];
            return asin ? `https://www.amazon.com/dp/${asin.toUpperCase()}` : null;
        }
        u.hash = ''; ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'tag'].forEach((k) => u.searchParams.delete(k));
        return u.toString();
    } catch { return null; }
}

/** Amazon's best-seller departments: what people actually buy, across everything a household needs. */
const DEPARTMENTS: [string, string][] = [
    ['electronics', 'Electronics'], ['wireless', 'Phones & accessories'], ['videogames', 'Gaming'], ['pc', 'Computers'], ['photo', 'Cameras'],
    ['kitchen', 'Kitchen'], ['garden', 'Home'], ['hi', 'Home improvement'], ['tools', 'Tools'], ['toys-and-games', 'Toys'], ['baby-products', 'Baby'],
    ['beauty', 'Beauty'], ['hpc', 'Health'], ['apparel', 'Fashion'], ['shoes', 'Shoes'], ['luggage', 'Bags'], ['jewelry', 'Jewelry'],
    ['sporting-goods', 'Sports'], ['automotive', 'Car accessories'], ['office-products', 'Office'], ['pet-supplies', 'Pets'], ['musical-instruments', 'Music'],
];
const NOT_GOODS = /subscription|monthly auto-renewal|gift card|digital code|e-?gift|(plan|membership).*renew|kindle edition|audible/i;

/** The top products of one department (30 a page), as candidates to be priced from their own pages. */
export async function bestSellers(dept: string, page: number): Promise<SourceItem[]> {
    if (!/^[a-z-]{2,30}$/.test(dept)) return [];
    const html = await politely('amazon.com', async () => {
        const res = await getWithRetry(`https://www.amazon.com/gp/bestsellers/${dept}${page > 1 ? `?pg=${page}` : ''}`);
        if (!res.ok) throw new Error(`Amazon answered ${res.status}`);
        return res.text();
    });
    const category = DEPARTMENTS.find(([d]) => d === dept)?.[1];
    const out: SourceItem[] = [];
    for (const chunk of html.split('id="gridItemRoot"').slice(1)) {
        const asin = chunk.match(/\/dp\/([A-Z0-9]{10})/)?.[1];
        const img = chunk.match(/<img[^>]*?src="(https:[^"]+)"/)?.[1];
        const title = decode(chunk.match(/<img[^>]*?alt="([^"]+)"/)?.[1] ?? '');
        if (!asin || !img || !title || NOT_GOODS.test(title)) continue;
        out.push({ sourceId: `https://www.amazon.com/dp/${asin}`, url: `https://www.amazon.com/dp/${asin}`, title: title.slice(0, 200), images: [img.replace(/\._AC_UL\d+_?/, '._AC_SL1000_')], category, origin: 'USA', price: 0, currency: 'USD', available: true });
    }
    return out;
}

export const web: Connector = {
    id: 'WEB', label: 'Store pages', detailOnDiscover: true,
    starter: [
        ...Array.from({ length: 8 }, (_, i) => ({ query: `cars:${i + 1}`, category: 'Cars' })),
        ...Object.entries(BRAND_FEEDS).map(([key, f]) => ({ query: `brand:${key}`, category: f.category })),
        ...DEPARTMENTS.flatMap(([d, category]) => [1, 2, 3].map((pg) => ({ query: `bestsellers:${d}:${pg}`, category }))),
    ],
    configured: () => true,
    async search(query) {
        const b = query.match(/^brand:([a-z0-9-]+)$/);
        if (b) return brandList(b[1]);
        const c = query.match(/^cars:(\d+)$/);
        if (c) return carList(Number(c[1]));
        const m = query.match(/^bestsellers:([a-z-]+):(\d+)$/);
        return m ? bestSellers(m[1], Number(m[2])) : [];
    },
    parseUrl: (url) => normaliseUrl(url),
    async fetch(sourceId) {
        let entry: WatchEntry | undefined;
        let urls: string[];
        if (sourceId.startsWith('w:')) {
            entry = (await loadWatchlist()).find((w) => w.slug === sourceId.slice(2));
            if (!entry) return null;
            urls = entry.urls;
        } else urls = [sourceId];

        const reads: { url: string; page: PageRead }[] = [];
        let lastError: unknown = null;
        for (const url of urls) {
            try {
                const page = await openPage(url);
                const usd = page.price !== null && page.currency === 'USD' && (!entry?.minUsd || page.price >= entry.minUsd) && (!entry?.maxUsd || page.price <= entry.maxUsd);
                if (usd && page.available) reads.push({ url, page });
            } catch (e) { lastError = e; }
        }
        const price = marketPrice(reads.map((r) => r.page.price as number));
        if (price === null) { if (lastError && !reads.length) throw lastError instanceof Error ? lastError : new Error('Could not read the price'); return null; }

        const first = reads[0].page;
        const car = first.specs?.engineCc ? first.specs : null;
        if (car) {
            // A right-hand-drive car delivered to a port is the only kind that can be sold here.
            if (String(car.steering ?? '').toLowerCase() !== 'right' || !(Number(car.cnfUsd) >= price)) return null;
            return {
                sourceId, url: sourceId, title: first.title || 'Used car', images: first.images, category: 'Cars', origin: 'Japan', price, currency: 'USD',
                shippingPrice: Math.round((Number(car.cnfUsd) - price) * 100) / 100, weightKg: car.weightKg ? Number(car.weightKg) : undefined, available: true,
                deliveryDays: { min: 40, max: 70 }, specs: car, description: [car.year, car.mileageKm ? `${Number(car.mileageKm).toLocaleString('en')} km` : '', car.engineCc ? `${Number(car.engineCc).toLocaleString('en')} cc` : '', car.transmission, car.fuel, car.color].filter(Boolean).join(' · '),
            } as SourceItem;
        }
        const images = [...new Set([...(entry?.image ? [entry.image] : []), ...reads.flatMap((r) => r.page.images)])].slice(0, 8);
        return {
            sourceId, url: entry ? urls[0] : sourceId, title: (entry?.title ?? first.title) || 'Item', description: entry?.description ?? first.description?.slice(0, 1500),
            images, category: entry?.category, origin: 'USA', price, currency: 'USD', weightKg: entry?.weightKg, available: true, deliveryDays: { min: 10, max: 21 },
        } as SourceItem;
    },
};

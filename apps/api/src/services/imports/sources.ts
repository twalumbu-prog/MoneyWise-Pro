/**
 * Where imported products come from. Each source is a small connector that can fetch one item by its id (to keep a price and photos
 * current), optionally search (to discover items for the catalogue) and recognise its own product links. A connector with no keys set is
 * simply switched off, so adding one later is a matter of setting its environment variables.
 *
 * eBay (Browse API, application token, read-only) is written from eBay's documentation and not yet run against live keys. CJ Dropshipping
 * (CJ_API_KEY) was tried against the live API: search, product details, and the shipping options to Zambia.
 */

import { web } from './web';

export interface SourceItem {
    sourceId: string;
    url: string;
    title: string;
    description?: string;
    images: string[];
    category?: string;
    origin?: string;
    price: number;
    currency: string;
    shippingPrice?: number;
    weightKg?: number;
    available: boolean;
    /** Choices the item comes in (colour, size), as the source names its variants. */
    options?: { name: string; values: string[] }[];
    /** How long delivery to Zambia takes, when the source says. */
    deliveryDays?: { min: number; max: number };
    /** What a vehicle is: year, mileage, engine size and so on. */
    specs?: Record<string, unknown>;
}

export interface Connector {
    id: 'EBAY' | 'CJ' | 'WEB';
    label: string;
    configured(): boolean;
    fetch(sourceId: string): Promise<SourceItem | null>;
    search(query: string, limit: number): Promise<SourceItem[]>;
    /** False when the source's allowance for the day is nearly used, so background work stops and people's own requests keep working. */
    spareBudget?(): boolean;
    /** The source's own id for a product link, or null when the link isn't one of theirs. */
    parseUrl(url: string): string | null;
    /** True when a search only returns a summary, so a new item is fetched in full before it is saved. */
    detailOnDiscover?: boolean;
    /** The searches this source runs by itself to fill the catalogue, when they differ from the general list. */
    starter?: { query: string; category: string }[];
}

const stripHtml = (s: string) => s.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/* ───────────── eBay ───────────── */

const EBAY_API = 'https://api.ebay.com';
let ebayToken: { value: string; expires: number } | null = null;

async function ebayAccessToken(): Promise<string> {
    if (ebayToken && ebayToken.expires > Date.now() + 60_000) return ebayToken.value;
    const id = process.env.EBAY_CLIENT_ID, secret = process.env.EBAY_CLIENT_SECRET;
    if (!id || !secret) throw new Error('eBay isn’t set up');
    const res = await fetch(`${EBAY_API}/identity/v1/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` },
        body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    });
    if (!res.ok) throw new Error(`eBay sign-in failed (${res.status})`);
    const j: any = await res.json();
    ebayToken = { value: j.access_token, expires: Date.now() + Number(j.expires_in ?? 7200) * 1000 };
    return ebayToken.value;
}

async function ebayGet(path: string): Promise<any | null> {
    const res = await fetch(`${EBAY_API}${path}`, {
        headers: { Authorization: `Bearer ${await ebayAccessToken()}`, 'X-EBAY-C-MARKETPLACE-ID': process.env.EBAY_MARKETPLACE || 'EBAY_US', Accept: 'application/json' },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
        const body: any = await res.json().catch(() => null);
        // eBay answers 404-like errors for an ended listing with a 400 and errorId 11001
        if (res.status === 400 && body?.errors?.some((e: any) => e.errorId === 11001)) return null;
        throw new Error(`eBay answered ${res.status}`);
    }
    return res.json();
}

function fromEbay(i: any): SourceItem | null {
    const price = Number(i?.price?.value);
    if (!i?.itemId || !i?.title || !(price >= 0) || !i?.price?.currency) return null;
    const images = [i.image?.imageUrl, ...(i.additionalImages ?? []).map((x: any) => x.imageUrl)].filter((x): x is string => !!x && /^https?:\/\//.test(x)).slice(0, 8);
    const ship = Number(i.shippingOptions?.[0]?.shippingCost?.value);
    const status = i.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus;
    const path: string = i.categoryPath ?? i.categories?.[0]?.categoryName ?? '';
    return {
        sourceId: String(i.itemId), url: String(i.itemWebUrl ?? ''), title: String(i.title).slice(0, 200),
        description: stripHtml(String(i.shortDescription ?? i.description ?? '')).slice(0, 1500) || undefined,
        images, category: path.split(/[|>]/).map((s) => s.trim()).filter(Boolean)[0],
        origin: i.itemLocation?.country ? ({ US: 'USA', CN: 'China', GB: 'UK', ZA: 'South Africa', DE: 'Germany' } as Record<string, string>)[i.itemLocation.country] ?? i.itemLocation.country : undefined,
        price, currency: String(i.price.currency).toUpperCase(), shippingPrice: ship >= 0 ? ship : undefined,
        available: status ? status !== 'OUT_OF_STOCK' : true,
    };
}

const ebay: Connector = {
    id: 'EBAY', label: 'eBay',
    configured: () => !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
    async fetch(sourceId) {
        const data = /^v1\|/.test(sourceId)
            ? await ebayGet(`/buy/browse/v1/item/${encodeURIComponent(sourceId)}`)
            : await ebayGet(`/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(sourceId)}`);
        return data ? fromEbay(data) : null;
    },
    async search(query, limit) {
        const data = await ebayGet(`/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=${Math.min(50, Math.max(1, limit))}&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE}')}`);
        return ((data?.itemSummaries ?? []) as any[]).map(fromEbay).filter((x): x is SourceItem => !!x);
    },
    parseUrl(url) {
        try {
            const u = new URL(url);
            if (!/(^|\.)ebay\.[a-z.]+$/i.test(u.hostname)) return null;
            return u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,14})/)?.[1] ?? null;
        } catch { return null; }
    },
};

/* ───────────── CJ Dropshipping ───────────── */

const CJ_API = 'https://developers.cjdropshipping.com/api2.0/v1';
let cjToken: { value: string; expires: number } | null = null;

async function cjAccessToken(force = false): Promise<string> {
    if (!force && cjToken && cjToken.expires > Date.now() + 3_600_000) return cjToken.value;
    const key = process.env.CJ_API_KEY;
    if (!key) throw new Error('CJ isn’t set up');
    const res = await fetch(`${CJ_API}/authentication/getAccessToken`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key }) });
    const j: any = await res.json().catch(() => null);
    if (!res.ok || !j?.result || !j?.data?.accessToken) throw new Error(`CJ sign-in failed (${j?.message ?? res.status})`);
    const exp = Date.parse(j.data.accessTokenExpiryDate);
    cjToken = { value: j.data.accessToken, expires: Number.isFinite(exp) ? exp : Date.now() + 12 * 3_600_000 };
    return cjToken.value;
}

// A customer's own request (opening an item, searching) goes ahead of background work: the background jobs pause between items while
// anyone is waiting.
let userWaiting = 0;
export const userFirst = async <T,>(fn: () => Promise<T>): Promise<T> => { userWaiting++; try { return await fn(); } finally { userWaiting--; } };
export const backgroundTurn = async (): Promise<void> => { while (userWaiting > 0) await new Promise((r) => setTimeout(r, 250)); };

// CJ reports how many of the day's points have been used with every answer.
let cjPoints = { day: '', used: 0 };

// CJ allows one request a second, so every call waits its turn, a little over a second after the one before.
let cjQueue: Promise<unknown> = Promise.resolve();
let cjLastCall = 0;
const cjTurn = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = cjQueue.then(async () => {
        const wait = cjLastCall + 1150 - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        cjLastCall = Date.now();
        return fn();
    });
    cjQueue = run.catch(() => undefined);
    return run;
};

const cjCall = (method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> => cjTurn(() => cjRequest(method, path, body));

async function cjRequest(method: 'GET' | 'POST', path: string, body?: unknown, retry = true): Promise<any> {
    const res = await fetch(`${CJ_API}${path}`, { method, headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': await cjAccessToken() }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j: any = await res.json().catch(() => null);
    if (j?.pointsInfo) cjPoints = { day: new Date().toISOString().slice(0, 10), used: Number(j.pointsInfo.usedToday) || 0 };
    if (j && j.result === false && retry && /token|auth/i.test(String(j.message))) { cjToken = null; return cjRequest(method, path, body, false); }
    if (res.status === 429 && retry) { await new Promise((r) => setTimeout(r, 1500)); return cjRequest(method, path, body, false); }
    if (!res.ok || !j || j.result === false) throw new Error(`CJ answered ${res.status}${j?.message ? `: ${String(j.message).slice(0, 80)}` : ''}`);
    return j.data;
}

const asList = (x: unknown): string[] => {
    if (Array.isArray(x)) return x.map(String);
    try { const v = JSON.parse(String(x ?? '[]')); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
};
const firstPrice = (s: unknown): number => Number(String(s ?? '').split(/[-–—\s]+/).filter(Boolean)[0]);

const cj: Connector = {
    id: 'CJ', label: 'CJ Dropshipping', detailOnDiscover: true,
    configured: () => !!process.env.CJ_API_KEY,
    // Of the 50,000 points a day, background work stops at 40,000 so there is always room for what people ask for. A search costs 50 points, a full item 20.
    spareBudget: () => cjPoints.day !== new Date().toISOString().slice(0, 10) || cjPoints.used < 40_000,
    async search(query, limit) {
        const data = await cjCall('GET', `/product/listV2?keyWord=${encodeURIComponent(query)}&page=1&size=${Math.min(100, Math.max(1, limit))}`);
        const list: any[] = (data?.content ?? []).flatMap((c: any) => c.productList ?? []);
        return list.map((p) => {
            const price = firstPrice(p.sellPrice);
            return p.id && p.nameEn && price >= 0 ? { sourceId: String(p.id), url: `https://cjdropshipping.com/product/-p-${p.id}.html`, title: String(p.nameEn).slice(0, 200), images: p.bigImage ? [String(p.bigImage)] : [], price, currency: 'USD', origin: 'China', available: true } as SourceItem : null;
        }).filter((x): x is SourceItem => !!x);
    },
    async fetch(pid) {
        const d = await cjCall('GET', `/product/query?pid=${encodeURIComponent(pid)}`).catch((e) => { if (/not (exist|found)|no data/i.test(String(e?.message))) return null; throw e; });
        if (!d?.pid) return null;
        const variants: any[] = Array.isArray(d.variants) ? d.variants : [];
        const priced = variants.filter((v) => Number(v.variantSellPrice) >= 0).sort((a, b) => Number(a.variantSellPrice) - Number(b.variantSellPrice));
        const cheapest = priced[0];
        const price = cheapest ? Number(cheapest.variantSellPrice) : firstPrice(d.sellPrice);
        if (!(price >= 0)) return null;
        const images = [...new Set([...asList(d.productImageSet), ...asList(d.productImage), cheapest?.variantImage, d.bigImage].filter((x): x is string => !!x && /^https?:\/\//.test(x)))].slice(0, 8);
        const grams = Number(cheapest?.variantWeight) || Number(d.productWeight) || 0;

        // What it costs, and how long it takes, to get one to Zambia. No option means CJ can't send it there.
        let shippingPrice: number | undefined;
        let deliveryDays: { min: number; max: number } | undefined;
        if (cheapest?.vid) {
            const options: any[] = (await cjCall('POST', '/logistic/freightCalculate', { startCountryCode: 'CN', endCountryCode: 'ZM', products: [{ quantity: 1, vid: cheapest.vid }] }).catch(() => [])) ?? [];
            const best = options.filter((o) => Number(o.logisticPrice) >= 0).sort((a, b) => Number(a.logisticPrice) - Number(b.logisticPrice))[0];
            if (best) {
                shippingPrice = Number(best.logisticPrice);
                const m = String(best.logisticAging ?? '').match(/(\d+)\D+(\d+)/);
                if (m) deliveryDays = { min: Number(m[1]), max: Number(m[2]) };
            }
        }
        const name = String(d.productNameEn ?? d.productName ?? '');
        const optionValues = priced.length > 1 ? [...new Set(priced.map((v) => String(v.variantNameEn ?? '').replace(name, '').trim()).filter(Boolean))].slice(0, 20) : [];
        return {
            sourceId: String(d.pid), url: `https://cjdropshipping.com/product/-p-${d.pid}.html`, title: name.slice(0, 200), description: stripHtml(String(d.description ?? '')).slice(0, 1500) || undefined,
            images, category: String(d.categoryName ?? '').split('>').map((s) => s.trim()).filter(Boolean).pop(), origin: 'China', price, currency: 'USD',
            shippingPrice, weightKg: grams > 0 ? Math.round(grams) / 1000 : undefined, available: d.status === undefined || String(d.status) === '3' || String(d.status) === '1' ? shippingPrice !== undefined : false,
            options: optionValues.length ? [{ name: 'Version', values: optionValues }] : undefined, deliveryDays,
        };
    },
    parseUrl(url) {
        try {
            const u = new URL(url);
            if (!/(^|\.)cjdropshipping\.com$/i.test(u.hostname)) return null;
            return u.pathname.match(/-p-([0-9A-Za-z-]{10,})\.html/)?.[1] ?? null;
        } catch { return null; }
    },
};

export const CONNECTORS: Record<string, Connector> = { EBAY: ebay, CJ: cj, WEB: web };
export const connectorFor = (source: string): Connector | null => CONNECTORS[source] ?? null;
export const connectorForUrl = (url: string): { connector: Connector; sourceId: string } | null => {
    for (const c of Object.values(CONNECTORS)) { const id = c.parseUrl(url); if (id) return { connector: c, sourceId: id }; }
    return null;
};

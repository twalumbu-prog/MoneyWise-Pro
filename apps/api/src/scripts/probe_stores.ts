/** Opens a category page on each store, takes two product links from it and reports the price the reader finds. Run: npx tsx src/scripts/probe_stores.ts */
import { readPage } from '../services/imports/web';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = async (u: string) => { const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(25000) }); return { status: r.status, text: await r.text() }; };
const STORES: [string, string, RegExp][] = [
    ['Walmart', 'https://www.walmart.com/browse/electronics/3944', /href="(\/ip\/[^"?]+)/g],
    ['Target', 'https://www.target.com/c/electronics/-/N-5xtg6', /href="(\/p\/[^"?]+)/g],
    ['Zappos', 'https://www.zappos.com/men-sneakers-athletic-shoes', /href="(\/p\/[^"?]+)/g],
    ['GameStop', 'https://www.gamestop.com/', /href="(\/[^"]*\/products\/[^"?]+)/g],
    ['Ulta', 'https://www.ulta.com/shop/makeup', /href="(\/p\/[^"?]+)/g],
    ['REI', 'https://www.rei.com/c/camping-and-hiking', /href="(\/product\/[^"?]+)/g],
    ['Nike', 'https://www.nike.com/w/mens-shoes-nik1zy7ok', /href="(https:\/\/www\.nike\.com\/t\/[^"?]+)/g],
    ['Wayfair', 'https://www.wayfair.com/furniture/cat/furniture-c45974.html', /href="(https:\/\/www\.wayfair\.com\/[^"?]*\/pdp\/[^"?]+)/g],
];
(async () => {
    for (const [name, cat, re] of STORES) {
        try {
            const c = await get(cat);
            const base = new URL(cat).origin;
            const links = [...new Set([...c.text.matchAll(re)].map((m) => (m[1].startsWith('http') ? m[1] : base + m[1])))].slice(0, 2);
            if (!links.length) { console.log(`${name.padEnd(9)} category ${c.status}, no product links found`); continue; }
            for (const l of links) {
                await new Promise((r) => setTimeout(r, 3000));
                const p = await get(l);
                const pg = readPage(p.text, new URL(l).hostname);
                console.log(`${name.padEnd(9)} ${p.status} price=${pg.price} ${pg.currency} img=${pg.images.length} avail=${pg.available} "${pg.title.slice(0, 45)}"`);
            }
        } catch (e: any) { console.log(`${name.padEnd(9)} ${e.cause?.code ?? e.message}`); }
        await new Promise((r) => setTimeout(r, 3000));
    }
    process.exit(0);
})();

/**
 * For each brand store: open a category page, then try product links from it until one gives a price the reader understands.
 * Run: npx tsx src/scripts/probe_brands.ts [name-filter]
 */
import { readPage } from '../services/imports/web';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = async (u: string) => {
    let err: unknown;
    for (let i = 0; i < 2; i++) {
        try { const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(25_000) }); return { status: r.status, text: await r.text(), url: r.url }; }
        catch (e) { err = e; await new Promise((r) => setTimeout(r, 2000)); }
    }
    throw err;
};
const BRANDS: [string, string][] = [
    ['Samsung', 'https://www.samsung.com/us/smartphones/all-smartphones/'],
    ['Xiaomi', 'https://www.mi.com/global/product-list/'],
    ['Google Store', 'https://store.google.com/us/category/phones'],
    ['Sony', 'https://electronics.sony.com/audio/headphones/c/all-headphones'],
    ['Nintendo', 'https://www.nintendo.com/us/store/games/'],
    ['JBL', 'https://www.jbl.com/bluetooth-speakers/'],
    ['Bose', 'https://www.bose.com/c/speakers'],
    ['Dyson', 'https://www.dyson.com/vacuum-cleaners'],
    ['HP', 'https://www.hp.com/us-en/shop/vwa/laptops'],
    ['Dell', 'https://www.dell.com/en-us/shop/dell-laptops/scr/laptops'],
    ['Lenovo', 'https://www.lenovo.com/us/en/c/laptops/'],
    ['Logitech', 'https://www.logitech.com/en-us/shop/c/keyboards.html'],
    ['GoPro', 'https://gopro.com/en/us/shop/cameras'],
    ['Garmin', 'https://www.garmin.com/en-US/c/wearables-smartwatches/'],
    ['Anker', 'https://www.anker.com/collections/power-banks'],
    ['Oppo', 'https://www.oppo.com/en/smartphones/'],
    ['Huawei', 'https://consumer.huawei.com/en/phones/'],
    ['OnePlus', 'https://www.oneplus.com/us/store/phones'],
    ['Motorola', 'https://www.motorola.com/us/smartphones'],
    ['Meta', 'https://www.meta.com/quest/quest-3s/'],
    ['Samsung Book', 'https://www.samsung.com/us/computing/galaxy-books/all-galaxy-books/'],
    ['Microsoft', 'https://www.microsoft.com/en-us/store/b/shop-surface-pcs'],
    ['Acer', 'https://store.acer.com/en-us/laptops'],
    ['Asus', 'https://www.asus.com/us/laptops/'],
    ['Razer', 'https://www.razer.com/gaming-laptops'],
    ['MSI', 'https://us-store.msi.com/Laptops'],
    ['LG', 'https://www.lg.com/us/laptops'],
    ['Lenovo', 'https://www.lenovo.com/us/en/c/laptops/thinkpad/'],
];

(async () => {
    const only = (process.argv[2] ?? '').toLowerCase();
    for (const [name, cat] of BRANDS) {
        if (only && !name.toLowerCase().includes(only)) continue;
        try {
            const c = await get(cat);
            if (c.status >= 400) { console.log(`${name.padEnd(13)} category ${c.status}`); continue; }
            const origin = new URL(c.url).origin;
            const links = [...new Set([...c.text.matchAll(/href="([^"#?]+)"/g)].map((m) => { try { return new URL(m[1], c.url).toString(); } catch { return ''; } }))]
                .filter((u) => u.startsWith(origin) && /(\/p\/|\/product|\/buy|\/shop\/|\/smartphones\/|\/phones\/|\/products\/|\/item|\.html$|\/pd\/)/i.test(u) && !/(support|blog|compare|\.(png|jpg|css|js)$|cart|login|account)/i.test(u) && u !== c.url)
                .slice(0, 6);
            let found = '';
            for (const l of links) {
                await new Promise((r) => setTimeout(r, 3000));
                try {
                    const p = await get(l);
                    const pg = readPage(p.text, new URL(l).hostname);
                    if (pg.price) { found = `price=${pg.price} ${pg.currency} img=${pg.images.length} "${pg.title.slice(0, 40)}" ${l.slice(0, 70)}`; break; }
                } catch { /* try the next link */ }
            }
            console.log(`${name.padEnd(13)} category ${c.status}, ${links.length} links → ${found || 'no price found'}`);
        } catch (e: any) { console.log(`${name.padEnd(13)} ${e.cause?.code ?? e.message}`); }
        await new Promise((r) => setTimeout(r, 3000));
    }
    process.exit(0);
})();

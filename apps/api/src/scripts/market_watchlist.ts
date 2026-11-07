/**
 * The products the marketplace tracks at market price, and a way to try them. Run from apps/api:
 *   npx tsx src/scripts/market_watchlist.ts            dry run: read every page and show the price a buyer would see (nothing saved)
 *   npx tsx src/scripts/market_watchlist.ts --save     save the list as the watchlist, then price and list the items
 * Weights are rough shipped weights (with box) and only matter for the shipping estimate.
 */
import { supabase } from '../lib/supabase';
import { DEFAULT_SETTINGS, priceImport } from '../services/imports/pricing';
import { web, type WatchEntry } from '../services/imports/web';
import { loadSettings, refreshStale, saveSettings } from '../services/imports.service';

const A = 'https://www.apple.com/shop';
const apple = (slug: string, title: string, category: string, path: string, weightKg: number, minUsd: number, maxUsd: number): WatchEntry =>
    ({ slug, title, category, urls: [`${A}/${path}`], weightKg, minUsd, maxUsd });

export const WATCH: WatchEntry[] = [
    apple('apple-iphone-17', 'Apple iPhone 17', 'Phones', 'buy-iphone/iphone-17', 0.45, 500, 1500),
    apple('apple-iphone-17e', 'Apple iPhone 17e', 'Phones', 'buy-iphone/iphone-17e', 0.45, 300, 1000),
    apple('apple-iphone-air', 'Apple iPhone Air', 'Phones', 'buy-iphone/iphone-air', 0.45, 500, 1800),
    apple('apple-iphone-18-pro', 'Apple iPhone 18 Pro', 'Phones', 'buy-iphone/iphone-18-pro', 0.5, 700, 2200),
    apple('apple-iphone-16', 'Apple iPhone 16', 'Phones', 'buy-iphone/iphone-16', 0.45, 400, 1300),
    apple('apple-ipad', 'Apple iPad', 'Tablets', 'buy-ipad/ipad', 0.8, 200, 900),
    apple('apple-ipad-mini', 'Apple iPad mini', 'Tablets', 'buy-ipad/ipad-mini', 0.6, 300, 1100),
    apple('apple-ipad-air', 'Apple iPad Air', 'Tablets', 'buy-ipad/ipad-air', 0.9, 400, 1500),
    apple('apple-ipad-pro', 'Apple iPad Pro', 'Tablets', 'buy-ipad/ipad-pro', 1.0, 700, 2500),
    apple('apple-macbook-air', 'Apple MacBook Air', 'Laptops', 'buy-mac/macbook-air', 2.2, 700, 2500),
    apple('apple-macbook-pro', 'Apple MacBook Pro', 'Laptops', 'buy-mac/macbook-pro', 2.8, 1200, 4500),
    apple('apple-mac-mini', 'Apple Mac mini', 'Computers', 'buy-mac/mac-mini', 1.8, 400, 2000),
    apple('apple-imac', 'Apple iMac', 'Computers', 'buy-mac/imac', 9.5, 1000, 3000),
    apple('apple-watch', 'Apple Watch Series', 'Watches', 'buy-watch/apple-watch', 0.4, 300, 1500),
    apple('apple-watch-se', 'Apple Watch SE', 'Watches', 'buy-watch/apple-watch-se', 0.4, 200, 600),
];

(async () => {
    const save = process.argv.includes('--save');
    const { settings } = await loadSettings(true);
    console.log(`Rates: $1 = K${settings.fx.USD}, buffer ${settings.pricing.bufferPercent ?? DEFAULT_SETTINGS.pricing.bufferPercent}%, duty ${settings.pricing.dutyPercent}%, VAT ${settings.pricing.vatPercent}%, fee ${settings.pricing.feePercent}% (min K${settings.pricing.minFee}), freight $${settings.pricing.shippingPerKgUsd}/kg\n`);
    let ok = 0;
    for (const w of WATCH) {
        // The dry run reads the store address directly, so nothing needs to be saved first.
        try {
            const it = await web.fetch(w.urls[0]);
            if (!it || it.price < (w.minUsd ?? 0) || it.price > (w.maxUsd ?? Infinity)) { console.log(`--  ${w.title.padEnd(26)} no usable price${it ? ` ($${it.price} is outside $${w.minUsd}-$${w.maxUsd})` : ''}`); continue; }
            const q = priceImport({ price: it.price, currency: 'USD', shipping_price: 0, weight_kg: w.weightKg ?? null, source: 'WEB' }, 1, settings);
            console.log(`ok  ${w.title.padEnd(26)} store $${String(it.price).padEnd(7)} → buyer pays K${q.totalZmw.toLocaleString()}  (item K${q.itemZmw.toLocaleString()} + freight K${q.shippingZmw.toLocaleString()} + tax K${q.taxesZmw.toLocaleString()} + fee K${q.feeZmw.toLocaleString()})  images=${it.images.length}`);
            ok++;
        } catch (e: any) { console.log(`--  ${w.title.padEnd(26)} ${e.message}`); }
    }
    console.log(`\n${ok}/${WATCH.length} priced`);
    if (save) {
        await saveSettings({ watch: WATCH });
        const r = await refreshStale({ budgetMs: 150_000, hydrate: 40, refresh: 0, searches: 0 });
        console.log('saved. sweep:', r);
        const { data } = await supabase.from('imported_products').select('title, price, listed, is_active, refresh_error').eq('source', 'WEB');
        console.table(data);
    }
    process.exit(0);
})();

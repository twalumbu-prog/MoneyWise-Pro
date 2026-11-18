/**
 * Price logic (offline) and a live read of a few store pages. Run: npx tsx src/scripts/test_web_prices.ts [--live]
 * The live part only reports what each store gave back; a blocked or changed page is shown, not treated as a failure of the code.
 */
import { marketPrice, readPage, normaliseUrl, web } from '../services/imports/web';
import { priceImport, DEFAULT_SETTINGS } from '../services/imports/pricing';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

// market price
check('median of three', marketPrice([499, 499.99, 509]) === 499.99);
check('outlier (a bundle) ignored', marketPrice([499, 499.99, 509, 1200]) === 499.99, String(marketPrice([499, 499.99, 509, 1200])));
check('one store', marketPrice([599.99]) === 599.99);
check('two far apart: believe the lower', marketPrice([300, 700]) === 300);
check('two close: average', marketPrice([500, 520]) === 510);
check('nothing', marketPrice([]) === null);

// page reading, from page text
const ld = `<html><head><title>x</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Test Phone","image":["https://img.example/a.jpg"],"offers":{"@type":"Offer","price":"799.00","priceCurrency":"USD","availability":"https://schema.org/InStock"}}</script></head></html>`;
const a = readPage(ld, 'www.apple.com');
check('JSON-LD price', a.price === 799 && a.currency === 'USD' && a.title === 'Test Phone' && a.images.length === 1 && a.available);
const oos = readPage(ld.replace('InStock', 'OutOfStock'), 'www.apple.com');
check('JSON-LD out of stock', oos.available === false);
const amz = `<title>t</title><span id="productTitle"> Some Headset </span><div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$1,249.50</span></span></div><div>$34488 elsewhere</div>`;
const am = readPage(amz, 'www.amazon.com');
check('Amazon buy-box price', am.price === 1249.5 && am.title === 'Some Headset', JSON.stringify(am.price));
check('link cleaning', normaliseUrl('https://www.amazon.com/Some-Name/dp/B0CCZ1L489/ref=sr_1_1?tag=x') === 'https://www.amazon.com/dp/B0CCZ1L489');
check('unlisted store refused', normaliseUrl('https://evil.example/dp/B0CCZ1L489') === null && normaliseUrl('http://www.apple.com/x') === null);
check('look-alike host refused', normaliseUrl('https://notapple.com/x') === null && normaliseUrl('https://apple.com.evil.io/x') === null);

// pricing: market buffer applies to WEB items only
const base = { price: 500, currency: 'USD', shipping_price: 0, weight_kg: 0.6 };
const plain = priceImport({ ...base, source: 'MANUAL' }, 1, DEFAULT_SETTINGS);
const market = priceImport({ ...base, source: 'WEB' }, 1, DEFAULT_SETTINGS);
check('buffer raises a market-priced item', market.itemZmw > plain.itemZmw && Math.abs(market.itemZmw / plain.itemZmw - 1.05) < 0.001, `${plain.totalZmw} -> ${market.totalZmw}`);
console.log(`     example: $500 item, 0.6 kg → item K${market.itemZmw}, shipping K${market.shippingZmw}, taxes K${market.taxesZmw}, fee K${market.feeZmw}, total K${market.totalZmw}`);

// live
if (process.argv.includes('--live')) {
    (async () => {
        const pages = [
            'https://www.apple.com/shop/buy-iphone/iphone-16',
            'https://www.bestbuy.com/site/meta-quest-3-breakthrough-mixed-reality-512gb-white/6554912.p',
            'https://www.meta.com/quest/quest-3/',
            'https://gamestop.com/consoles-hardware/virtual-reality/products/meta-quest-3s-128gb---dive-into-mixed-reality---unreal-experiences---all-in--one-headset/415531.html',
            'https://www.amazon.com/dp/B0CCZ1L489',
        ];
        for (const p of pages) {
            try {
                const it = await web.fetch(p);
                console.log(it ? `live ${p.slice(0, 60)} → $${it.price} "${it.title.slice(0, 50)}" images=${it.images.length}` : `live ${p.slice(0, 60)} → no price`);
            } catch (e: any) { console.log(`live ${p.slice(0, 60)} → ${e.message}`); }
        }
        process.exit(failed ? 1 : 0);
    })();
} else process.exit(failed ? 1 : 0);

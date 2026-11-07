/**
 * Dry run of best-seller discovery and page pricing against the live Amazon site (nothing is saved).
 *   npx tsx src/scripts/test_amazon_discovery.ts [department] [how-many-to-price]
 */
import { web } from '../services/imports/web';

(async () => {
    const dept = process.argv[2] || 'kitchen';
    const n = Number(process.argv[3]) || 4;
    const found = await web.search(`bestsellers:${dept}:1`, 30);
    console.log(`found ${found.length} in "${dept}"`, found.slice(0, 2).map((f) => f.title.slice(0, 50)));
    let priced = 0;
    for (const f of found.slice(0, n)) {
        try {
            const it = await web.fetch(f.sourceId);
            if (it) priced++;
            console.log(it ? `$${it.price}  ${it.title.slice(0, 60)}  images=${it.images.length}` : `no buy-box price: ${f.title.slice(0, 50)}`);
        } catch (e: any) { console.log('ERR', e.message); }
    }
    console.log(`${priced}/${Math.min(n, found.length)} priced`);
    process.exit(0);
})();

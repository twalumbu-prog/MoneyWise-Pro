/**
 * Phase 1 check against the live tables, with temporary prices that are removed at the end.
 * Run: npx tsx src/scripts/test_price_compare.ts
 */
import { supabase } from '../lib/supabase';
import { compare, getItem, saveItem, savePricePoint, searchCatalog, setPricePointStatus, PriceError } from '../services/priceCompare.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const TAG = 'ZZ TEST';

(async () => {
    const made: string[] = [];
    let tempItemId: string | null = null;
    try {
        // catalogue search
        const all = await searchCatalog();
        check('catalogue has categories', all.categories.length >= 10 && all.items.length > 0, `${all.categories.length} categories`);
        const cement = await searchCatalog('cement 50kg');
        const cement2 = await searchCatalog('cement bag');
        check('search finds cement', cement2.items.some((i) => /cement/i.test(i.name)), `${cement2.items.length} found`);
        check('search narrows by category', (await searchCatalog(undefined, 'Roofing')).items.every((i) => i.category === 'Roofing'));
        void cement;

        // a temporary item so real items stay untouched
        const item = await saveItem({ name: `${TAG} Widget 10 kg bag`, category: 'ZZ Test', unit: 'bag', unitDetail: '10 kg' });
        tempItemId = item.id;
        check('item saved', !!item.id && item.slug.startsWith('zz-test'));
        check('item found by slug', (await getItem(item.slug)).id === item.id);

        const add = async (place: string, price: number, ageDays: number, extra: Record<string, unknown> = {}) => {
            const p = await savePricePoint({ catalogItemId: item.id, placeName: `${TAG} ${place}`, price, observedOn: daysAgo(ageDays), town: 'Lusaka', ...extra }, 'test');
            made.push(p.id); return p;
        };
        const a = await add('A', 100, 2);
        await add('B', 110, 5, { delivers: true });
        await add('C', 130, 10, { town: 'Ndola' });
        await add('Old depot', 60, 200);              // too old: shown, but must not set the cheapest
        await add('Bulk depot', 70, 3, { minQty: 100 }); // bulk price: shown, but must not set the cheapest
        const exp = await add('Expired', 50, 1);
        await setPricePointStatus(exp.id, 'EXPIRED');       // must not appear at all

        const r = await compare(item.slug);
        const placeOf = (o: any) => String(o.place).replace(`${TAG} `, '');
        check('expired price is hidden', !r.offers.some((o) => placeOf(o) === 'Expired'));
        check('all other offers shown', r.offers.length === 5, `${r.offers.length}`);
        check('cheapest ignores old and bulk prices', r.stats.lowest === 100 && r.offers[0].price === 100 && !!r.offers[0].cheapest, `lowest ${r.stats.lowest}`);
        check('typical price is the median of counted prices', r.stats.typical === 110 && r.stats.counted === 3, `typical ${r.stats.typical}, counted ${r.stats.counted}`);
        check('savings against typical', r.offers[0].vsTypical === 10 && r.offers[2].vsTypical === -20);
        check('old price is last and marked stale', placeOf(r.offers[r.offers.length - 1]) === 'Old depot' && r.offers[r.offers.length - 1].freshness === 'STALE');
        check('bulk price kept apart from the single-unit order', r.offers.findIndex((o) => placeOf(o) === 'Bulk depot') > 2);
        check('freshness labels', r.offers.find((o) => placeOf(o) === 'A')?.freshness === 'FRESH');
        check('towns listed', r.towns.join(',') === 'Lusaka,Ndola', r.towns.join(','));
        check('spread', r.stats.spread === 30, String(r.stats.spread));

        // validation
        let e1 = false; try { await savePricePoint({ catalogItemId: item.id, placeName: 'X', price: 0 }, 't'); } catch (e) { e1 = e instanceof PriceError; }
        let e2 = false; try { await savePricePoint({ catalogItemId: item.id, placeName: 'X', price: 5, observedOn: daysAgo(-30) }, 't'); } catch (e) { e2 = e instanceof PriceError; }
        let e3 = false; try { await savePricePoint({ catalogItemId: '00000000-0000-0000-0000-000000000000', placeName: 'X', price: 5 }, 't'); } catch (e) { e3 = e instanceof PriceError; }
        let e4 = false; try { await getItem('no-such-thing'); } catch (e) { e4 = e instanceof PriceError && e.httpStatus === 404; }
        check('zero price refused', e1); check('future date refused', e2); check('unknown catalogue item refused', e3); check('unknown item is a 404', e4);

        // price edit moves the ranking
        await savePricePoint({ catalogItemId: item.id, placeName: `${TAG} A`, price: 140 }, 'test', a.id);
        const r2 = await compare(item.slug);
        check('editing a price re-ranks', r2.stats.lowest === 110, `lowest ${r2.stats.lowest}`);

        // no prices at all
        const empty = await saveItem({ name: `${TAG} Empty 1 kg`, category: 'ZZ Test', unit: 'kg' });
        const re = await compare(empty.slug);
        check('item with no prices says so', re.offers.length === 0 && re.stats.lowest === null && !!re.note);
        await supabase.from('catalog_items').delete().eq('id', empty.id);

        // a MoneyWise listing that names the item joins the comparison, and is put back as it was
        const { data: prod } = await supabase.from('products').select('id, catalog_item_id, price').eq('marketplace_listed', true).eq('is_active', true).limit(1).maybeSingle();
        if (prod) {
            const before = prod.catalog_item_id ?? null;
            try {
                await supabase.from('products').update({ catalog_item_id: item.id }).eq('id', prod.id);
                const r3 = await compare(item.slug);
                const listing = r3.offers.find((o) => o.kind === 'LISTING');
                check('a listing that names the item appears with a buy link', !!listing && listing.trust === 'LISTED' && listing.productId === prod.id, listing ? `K${listing.price}` : 'missing');
            } finally { await supabase.from('products').update({ catalog_item_id: before }).eq('id', prod.id); }
        } else console.log('     (no marketplace product to test linking with)');
    } catch (e: any) {
        console.log('ERROR:', e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        if (made.length) await supabase.from('price_points').delete().in('id', made);
        if (tempItemId) await supabase.from('catalog_items').delete().eq('id', tempItemId);
        await supabase.from('catalog_items').delete().like('name', `${TAG}%`);
        const { count } = await supabase.from('price_points').select('id', { count: 'exact', head: true }).like('place_name', `${TAG}%`);
        console.log(`cleanup: ${count ?? 0} test prices left`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();

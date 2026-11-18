/**
 * Phase 4 check against the live tables: the basket advice, and the anonymous business prices with their minimum-businesses rule.
 * Uses throwaway items, businesses and bills, and removes everything it made. Run: npx tsx src/scripts/test_advice.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { saveItem, savePricePoint, PriceError } from '../services/priceCompare.service';
import * as adv from '../services/advice.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const TAG = 'ZZ TEST';

(async () => {
    const tag = randomUUID().slice(0, 6);
    const itemIds: string[] = [];
    const orgIds: string[] = [];
    try {
        const cem = await saveItem({ name: `${TAG} Cement ${tag}`, category: 'ZZ Test', unit: 'bag' }); itemIds.push(cem.id);
        const sand = await saveItem({ name: `${TAG} Sand ${tag}`, category: 'ZZ Test', unit: 'tonne' }); itemIds.push(sand.id);
        const add = (item: any, place: string, price: number, town: string, extra: Record<string, unknown> = {}) => savePricePoint({ catalogItemId: item.id, placeName: `${TAG} ${place}`, price, town, observedOn: daysAgo(2), ...extra }, 'test');
        // A has both (cement 100, sand 300 → 40×100 + 5×300 = 5,500). B is cheapest for cement (90) but has no sand. C is cheapest for sand (250) but dear for cement (120).
        await add(cem, 'A', 100, 'Lusaka'); await add(sand, 'A', 300, 'Lusaka');
        await add(cem, 'B', 90, 'Kitwe'); await add(cem, 'C', 120, 'Lusaka'); await add(sand, 'C', 250, 'Lusaka');
        await add(cem, 'Old', 50, 'Lusaka', { observedOn: daysAgo(200) });          // stale: must be ignored
        await add(cem, 'Bulk', 80, 'Lusaka', { minQty: 100, delivers: true });       // bulk: only counts from 100 bags

        const r = await adv.basket([{ catalogItemId: cem.id, quantity: 40 }, { catalogItemId: sand.id, quantity: 5 }]);
        check('one place with everything is found', r.fullCoverage && r.singleOptions.length === 2, `${r.singleOptions.length} options`);
        check('cheapest single place is A at 5,500', r.singleOptions[0].total === 5500 && r.singleOptions[0].places[0].place.endsWith('A'), String(r.singleOptions[0].total));
        check('stale and out-of-quantity bulk prices are ignored', !JSON.stringify(r).includes('Old') && !JSON.stringify(r).includes('Bulk'));
        check('cheapest mix takes each product where it is cheapest', !!r.mix && r.mix.total === 40 * 90 + 5 * 250 && r.mix.places.length === 2, String(r.mix?.total));
        check('the mix is cheaper than the best single place and says so', !!r.mix && r.mix.total < r.singleOptions[0].total && r.notes.some((n) => /splitting it across 2 places/.test(n)), r.notes.join(' | '));
        check('typical total uses the middle current price of each product', r.typicalTotal === 40 * 100 + 5 * 275, String(r.typicalTotal));
        check('savings are measured against typical prices (can be negative)', r.mix?.savings === 525 && r.singleOptions[0].savings === -125, `${r.mix?.savings} / ${r.singleOptions[0].savings}`);

        const bulk = await adv.basket([{ catalogItemId: cem.id, quantity: 150 }]);
        check('a bulk price counts once the quantity is reached', bulk.mix?.total === 150 * 80, String(bulk.mix?.total));

        const kitwe = await adv.basket([{ catalogItemId: cem.id, quantity: 10 }], 'Kitwe');
        check('a town prefers places there', kitwe.mix?.lines[0].place.endsWith('B') === true, kitwe.mix?.lines[0].place);
        const nowhere = await adv.basket([{ catalogItemId: cem.id, quantity: 10 }], 'Mongu');
        check('a town with nothing nearby falls back and says so', nowhere.notes.some((n) => /Mongu/.test(n)) && !!nowhere.mix);

        const partial = await adv.basket([{ catalogItemId: cem.id, quantity: 1 }, { catalogItemId: sand.id, quantity: 1 }, { catalogItemId: (await saveItem({ name: `${TAG} Nothing ${tag}`, category: 'ZZ Test', unit: 'piece' }).then((i) => { itemIds.push(i.id); return i; })).id, quantity: 1 }]);
        check('a product with no prices is reported, the rest still advised', partial.notes.some((n) => /No current price/.test(n)) && !!partial.mix && partial.mix.missing.length === 1);
        let e1 = false; try { await adv.basket([]); } catch (e) { e1 = e instanceof PriceError; }
        let e2 = false; try { await adv.basket([{ catalogItemId: cem.id, quantity: 0 }]); } catch (e) { e2 = e instanceof PriceError; }
        check('an empty basket is refused', e1 && e2);

        const tpl = await adv.templates();
        check('example jobs resolve to catalogue products', tpl.templates.length >= 3 && tpl.templates.every((t) => t.lines.every((l) => !!l.item?.id)), tpl.templates.map((t) => `${t.name}:${t.lines.length}`).join(', '));

        // business prices
        const mk = async (n: number) => {
            const { data: org, error } = await supabase.from('organizations').insert({ name: `ZZ TEST biz${n} ${tag}`, slug: `zz-test-biz${n}-${tag}` }).select('id').single(); if (error) throw error;
            orgIds.push(org.id);
            const { data: prod } = await supabase.from('products').insert({ organization_id: org.id, name: `ZZ cement ${n}`, price: 1, product_type: 'PRODUCT', is_active: true, catalog_item_id: cem.id }).select('id').single();
            const { data: sup } = await supabase.from('suppliers').insert({ organization_id: org.id, name: 'ZZ supplier' }).select('id').single();
            return { org: org.id as string, prod: prod!.id as string, sup: sup!.id as string };
        };
        const bill = async (b: { org: string; prod: string; sup: string }, cost: number, opts: { status?: string; days?: number; lines?: number[] } = {}) => {
            const { data: bl, error } = await supabase.from('purchase_bills').insert({ organization_id: b.org, supplier_id: b.sup, bill_date: daysAgo(opts.days ?? 5), due_date: daysAgo(-20), status: opts.status ?? 'OPEN', total: 100 }).select('id').single(); if (error) throw error;
            for (const c of opts.lines ?? [cost]) await supabase.from('purchase_bill_lines').insert({ bill_id: bl.id, product_id: b.prod, description: 'ZZ cement', quantity: 1, unit_cost: c, line_total: c });
        };
        const biz = [];
        for (let i = 1; i <= 6; i++) biz.push(await mk(i));
        const costs = [100, 104, 108, 112, 116];
        for (let i = 0; i < 5; i++) await bill(biz[i], costs[i]);
        check('no figure while nobody has opted in', (await adv.businessPrices(cem.id)) === null);
        check('sharing defaults to off', (await adv.getSharing(biz[0].org)).sharing === false);
        for (let i = 0; i < 4; i++) await adv.setSharing(biz[i].org, true);
        check('four businesses are too few to show', (await adv.businessPrices(cem.id)) === null);
        await adv.setSharing(biz[4].org, true);
        const five: any = await adv.businessPrices(cem.id);
        check('five businesses give a median and a range', !!five && five.businesses === 5 && five.median === 108 && five.low === 104 && five.high === 112, JSON.stringify(five));
        check('the figure names nobody', !JSON.stringify(five).match(/org|name|supplier/i));
        await bill(biz[5], 5000); // business six has NOT opted in: must not count
        await adv.setSharing(biz[4].org, false);
        check('switching sharing off removes that business', (await adv.businessPrices(cem.id)) === null);
        await adv.setSharing(biz[4].org, true);
        await bill(biz[0], 999, { status: 'VOID' });             // a void bill is ignored
        await bill(biz[1], 999, { days: 200 });                  // an old bill is ignored
        await bill(biz[2], 0, { lines: [108, 108, 108, 108] });  // many lines from one business is still one vote
        const again: any = await adv.businessPrices(cem.id);
        check('void, old and repeated purchases don’t distort it, and each business counts once', again?.businesses === 5 && again?.median === 108, JSON.stringify(again));
        check('a business that did not opt in is not counted', again?.businesses === 5);
    } catch (e: any) {
        console.log('ERROR:', e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        if (orgIds.length) {
            const { data: bills } = await supabase.from('purchase_bills').select('id').in('organization_id', orgIds);
            const bIds = (bills ?? []).map((b: any) => b.id);
            if (bIds.length) { await supabase.from('purchase_bill_lines').delete().in('bill_id', bIds); await supabase.from('purchase_bills').delete().in('id', bIds); }
            await supabase.from('suppliers').delete().in('organization_id', orgIds);
            await supabase.from('products').delete().in('organization_id', orgIds);
            await supabase.from('app_settings').delete().in('key', orgIds.map((o) => `price_share:${o}`));
            await supabase.from('organizations').delete().in('id', orgIds);
        }
        if (itemIds.length) await supabase.from('catalog_items').delete().in('id', itemIds);
        await supabase.from('catalog_items').delete().like('name', `${TAG}%`);
        const { count: biz } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST biz% ${tag}`);
        const { count: pp } = await supabase.from('price_points').select('id', { count: 'exact', head: true }).like('place_name', `${TAG}%`);
        console.log(`cleanup: ${biz ?? 0} test businesses, ${pp ?? 0} test prices left`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();

function round(n: number) { return Math.round(n * 100) / 100; }

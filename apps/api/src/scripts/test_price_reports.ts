/**
 * Phase 3 check against the live tables: shopper price reports, confirmation, outlier holding, review and points. Uses two existing
 * accounts so the points ledger works, then removes every price and every point it added. Run: npx tsx src/scripts/test_price_reports.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { compare, saveItem, savePricePoint, PriceError } from '../services/priceCompare.service';
import * as rep from '../services/priceReports.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const expectErr = async (name: string, fn: () => Promise<unknown>, code?: string) => {
    try { await fn(); check(name, false, 'did not throw'); } catch (e: any) { check(name, e instanceof PriceError && (!code || e.code === code), e?.code ?? e?.message); }
};
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const TAG = 'ZZ TEST';

(async () => {
    let itemId: string | null = null;
    const { data: users } = await supabase.from('users').select('id').limit(2);
    if (!users || users.length < 2) { console.log('need two existing users to test points'); process.exit(1); }
    const [A, B] = users.map((u: any) => u.id as string);
    const C = randomUUID();
    const refsToClear: string[] = [];

    try {
        const item = await saveItem({ name: `${TAG} Sugar 2 kg ${randomUUID().slice(0, 6)}`, category: 'ZZ Test', unit: 'pack', unitDetail: '2 kg' });
        itemId = item.id;
        for (const [place, price] of [['ZZ Shop 1', 100], ['ZZ Shop 2', 105], ['ZZ Shop 3', 110]] as const) await savePricePoint({ catalogItemId: item.id, placeName: `${TAG} ${place}`, price, town: 'Lusaka' }, 'test');

        // place matching
        check('place keys ignore spelling, case and filler words', rep.placeKey('ShopRite  Garden City', null) === rep.placeKey('Shoprite, Garden-City Branch', 'Lusaka') || rep.placeKey('ShopRite Garden City', 'Lusaka') === rep.placeKey('Shoprite, Garden-City', 'lusaka'), `${rep.placeKey('ShopRite Garden City', 'Lusaka')} | ${rep.placeKey('Shoprite, Garden-City', 'lusaka')}`);

        // validation
        await expectErr('zero price refused', () => rep.submitReport(A, { catalogItemId: item.id, placeName: 'X', price: 0 }), 'PRICE');
        await expectErr('a place is needed', () => rep.submitReport(A, { catalogItemId: item.id, price: 10 }), 'PLACE');
        await expectErr('future date refused', () => rep.submitReport(A, { catalogItemId: item.id, placeName: 'ZZ Place', price: 10, observedOn: daysAgo(-5) }), 'DATE');
        await expectErr('a price older than two weeks is refused', () => rep.submitReport(A, { catalogItemId: item.id, placeName: 'ZZ Place', price: 10, observedOn: daysAgo(20) }), 'DATE');
        await expectErr('an insecure photo link is refused', () => rep.submitReport(A, { catalogItemId: item.id, placeName: 'ZZ Place', price: 10, evidenceUrl: 'http://example.com/a.jpg' }), 'EVIDENCE');
        await expectErr('unknown product refused', () => rep.submitReport(A, { catalogItemId: randomUUID(), placeName: 'X', price: 10 }));

        // first report: live straight away, points for the report and the photo
        const r1: any = await rep.submitReport(A, { catalogItemId: item.id, placeName: 'ZZ ShopRite Garden City', town: 'Lusaka', price: 104, evidenceUrl: 'https://example.com/tag.jpg' });
        refsToClear.push(`PRRPT:${r1.report.id}`, `PRCONF:${r1.report.id}`);
        check('a normal price is live at once, as a shopper report', r1.status === 'ACTIVE' && r1.report.source_type === 'SHOPPER_REPORT' && r1.report.trust === 'ENTERED' && !r1.confirmed);
        check('report and photo earn 15 points', r1.points === 15, `${r1.points}`);
        const { data: led } = await supabase.from('reward_ledger').select('points, organization_id, kind').eq('user_id', A).eq('ref', `PRRPT:${r1.report.id}`).maybeSingle();
        check('points are recorded as MoneyWise points', led?.points === 15 && led?.organization_id === null && led?.kind === 'BONUS', JSON.stringify(led));

        // the same shopper again the same day: a correction, not a second report
        const r1b: any = await rep.submitReport(A, { catalogItemId: item.id, placeName: 'ZZ ShopRite Garden City', town: 'Lusaka', price: 106 });
        check('reporting the same place again corrects it', r1b.updated === true && r1b.report.id === r1.report.id && Number(r1b.report.price) === 106 && r1b.points === 0);

        // a second shopper confirms
        const r2: any = await rep.submitReport(B, { catalogItemId: item.id, placeName: 'ZZ Shoprite, Garden-City', town: 'lusaka', price: 108 });
        refsToClear.push(`PRRPT:${r2.report.id}`, `PRCONF:${r2.report.id}`);
        check('a second shopper’s similar price confirms it', r2.confirmed === true, r2.message);
        const { data: pair } = await supabase.from('price_points').select('id, trust, confirmations').in('id', [r1.report.id, r2.report.id]);
        check('both reports become verified with two confirmations', (pair ?? []).length === 2 && (pair ?? []).every((p: any) => p.trust === 'VERIFIED' && p.confirmations === 2));
        check('the second shopper earns report plus confirmation points', r2.points === 30, `${r2.points}`);
        const { data: ledA } = await supabase.from('reward_ledger').select('points').eq('user_id', A).eq('ref', `PRCONF:${r1.report.id}`).maybeSingle();
        check('the first shopper is thanked for the confirmation', ledA?.points === 20, JSON.stringify(ledA));
        const cmp1 = await compare(item.id);
        const confirmedOffers = cmp1.offers.filter((o) => o.sourceType === 'SHOPPER_REPORT');
        check('the comparison shows the confirmed shopper prices', confirmedOffers.length === 2 && confirmedOffers.every((o) => o.trust === 'VERIFIED' && o.confirmations === 2));

        // far from the others: held for review
        const out: any = await rep.submitReport(B, { catalogItemId: item.id, placeName: 'ZZ Spar Manda Hill', town: 'Lusaka', price: 500 });
        check('a far-off price is held, with no points yet', out.status === 'PENDING' && out.report.flag === 'OUTLIER' && out.points === 0);
        check('a held price does not show in the comparison', !(await compare(item.id)).offers.some((o) => o.place === 'ZZ Spar Manda Hill'));
        const q = await rep.reviewQueue();
        check('the review queue shows it with the typical price', q.reports.some((x: any) => x.id === out.report.id && x.typical));
        const ok: any = await rep.approveReport(out.report.id, 'checked the tag');
        refsToClear.push(`PRRPT:${out.report.id}`, `PRCONF:${out.report.id}`);
        check('approving shows the price and pays the points', ok.report.status === 'ACTIVE' && ok.report.flag === null && ok.points === 10, `${ok.points}`);
        check('an approved price now shows', (await compare(item.id)).offers.some((o) => o.place === 'ZZ Spar Manda Hill'));
        await expectErr('can’t approve the same report twice', () => rep.approveReport(out.report.id), 'NOT_FOUND');

        const low: any = await rep.submitReport(B, { catalogItemId: item.id, placeName: 'ZZ Odd Corner Shop', price: 5 });
        check('a far-too-low price is held too', low.status === 'PENDING');
        await rep.rejectReport(low.report.id, 'typo');
        check('a rejected price never shows', !(await compare(item.id)).offers.some((o) => o.place === 'ZZ Odd Corner Shop'));
        await expectErr('can’t reject a report that is not waiting', () => rep.rejectReport(low.report.id), 'NOT_FOUND');

        // shopper's own list and place suggestions
        const mine = await rep.myReports(A);
        check('a shopper sees their own reports with points', mine.reports.some((x: any) => x.id === r1.report.id) && mine.totalPoints >= 35, `${mine.totalPoints}`);
        const places = await rep.knownPlaces(item.id);
        check('known places are suggested', places.places.some((p) => /Garden/i.test(p.placeName)));

        // rate limit
        const rows = Array.from({ length: 25 }, (_, i) => ({ catalog_item_id: item.id, source_type: 'SHOPPER_REPORT', place_name: `${TAG} bulk ${i}`, price: 100, reported_by: C, place_key: `bulk${i}` }));
        await supabase.from('price_points').insert(rows);
        await expectErr('a flood of reports is stopped', () => rep.submitReport(C, { catalogItemId: item.id, placeName: 'ZZ one more', price: 100 }), 'RATE');
    } catch (e: any) {
        console.log('ERROR:', e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        if (itemId) await supabase.from('catalog_items').delete().eq('id', itemId); // its price records go with it
        await supabase.from('catalog_items').delete().like('name', `${TAG}%`);
        if (refsToClear.length) await supabase.from('reward_ledger').delete().in('ref', refsToClear).in('user_id', [A, B]);
        const { count: pts } = await supabase.from('price_points').select('id', { count: 'exact', head: true }).like('place_name', `${TAG}%`);
        const { count: led } = await supabase.from('reward_ledger').select('id', { count: 'exact', head: true }).in('ref', refsToClear.length ? refsToClear : ['none']);
        console.log(`cleanup: ${pts ?? 0} test prices, ${led ?? 0} test point records left`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();

/**
 * Cars: reading a BE FORWARD vehicle page, pricing with a cost table, and (with --live) the real stock list.
 *   npx tsx src/scripts/test_cars.ts <saved-vehicle-page.html> [--live]
 * The cost table below is made-up test data for the arithmetic only; real figures are entered by the team and never come from here.
 */
import fs from 'fs';
import { readPage, carList, web } from '../services/imports/web';
import { DEFAULT_SETTINGS, PricingError, priceImport } from '../services/imports/pricing';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

(async () => {
    const file = process.argv[2];
    if (file && fs.existsSync(file)) {
        const pg = readPage(fs.readFileSync(file, 'utf8'), 'www.beforward.jp');
        const s = pg.specs as any;
        console.log('     read:', pg.title, pg.price, JSON.stringify(s));
        check('price', pg.price === 6160 && pg.currency === 'USD');
        check('specs', s?.engineCc === 1595 && s?.year === 2016 && s?.mileageKm === 67225 && s?.steering === 'Right', JSON.stringify({ cc: s?.engineCc, y: s?.year, km: s?.mileageKm, st: s?.steering }));
        check('price delivered to the port', s?.cnfUsd === 7331 && /Dar es Salaam/i.test(String(s?.port)), `${s?.cnfUsd} ${s?.port}`);
        check('photos', pg.images.length >= 1);
    } else console.log('(no saved page given: skipping the page test)');

    // pricing
    const car = { price: 6160, currency: 'USD', shipping_price: 1171, weight_kg: 1.4, source: 'WEB', category: 'Cars', specs: { engineCc: 1595, year: new Date().getFullYear() - 10 } };
    let blocked = false;
    try { priceImport(car, 1, DEFAULT_SETTINGS); } catch (e) { blocked = e instanceof PricingError; }
    check('no price until the cost table is set', blocked);
    const test = { ...DEFAULT_SETTINGS, vehicle: { configured: true, transportZmw: 10_000, clearingZmw: 5_000, vatPercent: 16, marginPercent: 5, minMarginZmw: 8_000, rules: [{ maxCc: 1500, maxAgeYears: 10, dutyPercent: 10 }, { maxCc: 2000, maxAgeYears: 10, dutyPercent: 20 }, { maxCc: 2000, maxAgeYears: 20, dutyPercent: 30 }] } };
    const q = priceImport(car, 5, test);
    const cif = 7331 * 27;
    const expected = Math.round((6160 * 27 + 1171 * 27 + 10_000 + (cif * 0.2 + (cif + cif * 0.2) * 0.16) + 5_000 + Math.max(8_000, cif * 0.05)) * 100) / 100;
    check('quantity is always one', q.quantity === 1);
    check('duty rule picked by engine size and age', Math.abs(q.totalZmw - expected) < 1, `${q.totalZmw} vs ${expected}`);
    console.log(`     example car: K${q.itemZmw.toLocaleString()} car + K${q.shippingZmw.toLocaleString()} freight and road + K${q.taxesZmw.toLocaleString()} duty and VAT + K${q.feeZmw.toLocaleString()} clearing and margin = K${q.totalZmw.toLocaleString()}`);
    let noRule = false;
    try { priceImport({ ...car, specs: { engineCc: 3500, year: 2016 } }, 1, test); } catch (e) { noRule = e instanceof PricingError; }
    check('no matching duty row is refused, not guessed', noRule);
    let incomplete = false;
    try { priceImport({ ...car, specs: {} }, 1, test); } catch (e) { incomplete = e instanceof PricingError; }
    check('a car with unreadable details is never priced as a parcel', incomplete);

    if (process.argv.includes('--live')) {
        const list = await carList(1);
        console.log(`     stock list page 1: ${list.length} cars, e.g. ${list[0]?.title} $${list[0]?.price} ${list[0]?.images[0]}`);
        // The list's own price is only a placeholder (many rows lay it out differently); the car's page gives the real one.
        check('stock list read', list.length >= 10 && list.every((c) => c.images[0]?.startsWith('https://')));
        let ok = 0;
        for (const c of list.slice(0, 3)) {
            const it = await web.fetch(c.sourceId).catch((e: any) => { console.log('     ERR', e.message); return null; });
            console.log(it ? `     ${it.title.slice(0, 55)} $${it.price} + $${it.shippingPrice} freight | ${it.description}` : `     skipped (left-hand drive or no delivered price): ${c.title.slice(0, 50)}`);
            if (it) ok++;
        }
        check('at least one of three cars read in full', ok >= 1);
    }
    process.exit(failed ? 1 : 0);
})();

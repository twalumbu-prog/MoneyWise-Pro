/**
 * Loads a visible sample so the cars and brand stores can be seen and tried: turns on car PREVIEW with provisional figures (shown as
 * an estimate, closed to orders), finds cars and brand-store products, and prices a first batch of them.
 *   npx tsx src/scripts/load_preview_stock.ts [cars-pages] [batch]
 * The car figures below are PLACEHOLDERS to show how it looks. They are not real freight, duty or margin numbers.
 */
import { discoverNow, hydrateWaiting, loadSettings, saveSettings } from '../services/imports.service';

const BRAND_KEYS = ['samsung-phones', 'samsung-tablets', 'samsung-watches', 'sony-headphones', 'bose-headphones', 'garmin-watches', 'anker-power-banks', 'motorola-phones'];

(async () => {
    const pages = Number(process.argv[2]) || 1;
    const batch = Number(process.argv[3]) || 30;
    await saveSettings({
        vehicle: {
            preview: true, configured: false, transportZmw: 12_000, clearingZmw: 6_000, vatPercent: 16, marginPercent: 5, minMarginZmw: 8_000,
            rules: [
                { maxCc: 1500, maxAgeYears: 10, dutyPercent: 25 }, { maxCc: 2000, maxAgeYears: 10, dutyPercent: 35 }, { maxCc: 3000, maxAgeYears: 10, dutyPercent: 45 }, { maxCc: 9999, maxAgeYears: 10, dutyPercent: 55 },
                { maxCc: 1500, maxAgeYears: 20, dutyPercent: 35 }, { maxCc: 2000, maxAgeYears: 20, dutyPercent: 45 }, { maxCc: 3000, maxAgeYears: 20, dutyPercent: 55 }, { maxCc: 9999, maxAgeYears: 20, dutyPercent: 65 },
            ],
        },
    });
    console.log('car preview on:', JSON.stringify((await loadSettings(true)).settings.vehicle).slice(0, 120));

    for (let i = 1; i <= pages; i++) { try { console.log(`cars page ${i}: ${await discoverNow('WEB', `cars:${i}`, 'Cars')} new`); } catch (e: any) { console.log(`cars page ${i}: ${e.message}`); } }
    for (const k of BRAND_KEYS) { try { console.log(`${k}: ${await discoverNow('WEB', `brand:${k}`)} new`); } catch (e: any) { console.log(`${k}: ${e.message}`); } }

    console.log(`pricing ${batch} waiting items...`);
    console.log('read:', await hydrateWaiting(batch, 'WEB'));
    process.exit(0);
})();

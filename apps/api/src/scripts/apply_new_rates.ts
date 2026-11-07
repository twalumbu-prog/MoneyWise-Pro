/** Applies the agreed rates: no import duty on ordinary goods (VAT stays), and a K10 fee floor. Run: npx tsx src/scripts/apply_new_rates.ts */
import { loadSettings, saveSettings } from '../services/imports.service';

(async () => {
    const before = (await loadSettings(true)).settings.pricing;
    const after = (await saveSettings({ pricing: { dutyPercent: 0, minFee: 10 } })).settings.pricing;
    console.log('before:', JSON.stringify(before));
    console.log('after: ', JSON.stringify(after));
    process.exit(0);
})();

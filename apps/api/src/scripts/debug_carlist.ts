/** Shows stock-list entries that have no price or no photo. Run: npx tsx src/scripts/debug_carlist.ts */
import { carList } from '../services/imports/web';

(async () => {
    const l = await carList(1);
    const bad = l.filter((c) => !(c.price > 0) || !c.images[0]?.startsWith('https://'));
    console.log(l.length, 'cars; without price or photo:', bad.map((b) => `${b.title.slice(0, 40)} | $${b.price} | ${b.images[0]}`));
    process.exit(0);
})();

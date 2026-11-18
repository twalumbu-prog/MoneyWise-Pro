/** Reads and prices candidates that are waiting (cars and brand-store items), so they can go live. Run: npx tsx src/scripts/hydrate_waiting.ts [how-many] [source] */
import { hydrateWaiting } from '../services/imports.service';

(async () => {
    const n = Number(process.argv[2]) || 30;
    const read = await hydrateWaiting(n, process.argv[3] || 'WEB');
    console.log(`read ${read} waiting items`);
    process.exit(0);
})();

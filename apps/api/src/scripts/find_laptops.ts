/** Where are the laptops? Lists catalogue items that look like laptops and why each is or isn't shown. Read-only. Run: npx tsx src/scripts/find_laptops.ts */
import { supabase } from '../lib/supabase';
import { loadSettings } from '../services/imports.service';
import { isTooCostly, priceImport } from '../services/imports/pricing';

(async () => {
    const { settings } = await loadSettings(true);
    const rows: any[] = [];
    for (let from = 0; from < 6000; from += 1000) {
        const { data } = await supabase.from('imported_products').select('id, source, title, category, price, currency, shipping_price, weight_kg, specs, is_active, listed, images, last_refreshed_at, refresh_error').or('title.ilike.%laptop%,title.ilike.%notebook%,title.ilike.%macbook%,title.ilike.%chromebook%,category.ilike.%laptop%,category.ilike.%computer%').order('id').range(from, from + 999);
        rows.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
    }
    console.log(`items that look like laptops or computers: ${rows.length}`);
    const state: Record<string, number> = {};
    const examples: Record<string, string[]> = {};
    for (const r of rows) {
        let s: string;
        if (!r.is_active) s = 'inactive (source says gone/unavailable)';
        else if (!r.listed) s = 'not listed yet';
        else if (!r.last_refreshed_at) s = 'waiting to be priced';
        else {
            try { const q = priceImport(r, 1, settings); s = isTooCostly(q) ? `HIDDEN: shipping over 3x item (item K${q.itemZmw.toFixed(0)}, ship K${q.shippingZmw.toFixed(0)})` : !(r.images?.length) ? 'no image' : 'shown'; }
            catch (e: any) { s = `no price: ${e.message}`; }
        }
        const k = `${r.source} | ${r.category ?? '-'} | ${s.replace(/\(item.*$/, '')}`;
        state[k] = (state[k] ?? 0) + 1;
        (examples[k] ??= []).length < 2 && examples[k].push(`${r.title.slice(0, 50)} [${s}]`);
    }
    console.table(state);
    Object.entries(examples).filter(([k]) => /HIDDEN|inactive|no price|no image/.test(k)).forEach(([k, v]) => console.log(k, '\n   ', v.join('\n    ')));
    process.exit(0);
})();

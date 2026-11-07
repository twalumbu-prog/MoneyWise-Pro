/** Counts WEB-sourced catalogue rows by store and state. Run: npx tsx src/scripts/web_stock_count.ts */
import { supabase } from '../lib/supabase';
import { browse } from '../services/imports.service';

(async () => {
    const { data } = await supabase.from('imported_products').select('source_url, category, listed, is_active, last_refreshed_at').eq('source', 'WEB').limit(5000);
    const by: Record<string, number> = {};
    for (const r of data ?? []) {
        const host = (() => { try { return new URL(String(r.source_url)).hostname.replace(/^www\./, ''); } catch { return '?'; } })();
        const k = `${host} | ${r.category ?? '-'} | ${r.last_refreshed_at ? (r.listed && r.is_active ? 'live' : 'inactive') : 'waiting'}`;
        by[k] = (by[k] ?? 0) + 1;
    }
    console.table(by);
    const b: any = await browse();
    console.log('buyer sees: total', b.total, '| stores', JSON.stringify(b.stores), '| categories', (b.categories ?? []).map((c: any) => `${c.name}:${c.count}`).join(', '));
    const cars: any = await browse(undefined, 'Cars');
    console.log('cars shown:', cars.total, cars.products?.slice(0, 3).map((p: any) => `${p.title.slice(0, 40)} K${p.perItemZmw} estimate=${p.vehicleEstimate}`));
    process.exit(0);
})();

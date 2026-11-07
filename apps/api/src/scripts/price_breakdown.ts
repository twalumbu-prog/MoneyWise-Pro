/**
 * Shows how a buyer's price is made up, across the live catalogue: item, shipping, duty and VAT, and fee as a share of the item price.
 * Read-only. Run: npx tsx src/scripts/price_breakdown.ts
 */
import { supabase } from '../lib/supabase';
import { loadSettings } from '../services/imports.service';
import { isTooCostly, priceImport } from '../services/imports/pricing';

(async () => {
    const { settings } = await loadSettings(true);
    const rows: any[] = [];
    for (let from = 0; from < 6000; from += 1000) {
        const { data } = await supabase.from('imported_products').select('title, source, category, price, currency, shipping_price, weight_kg, specs').eq('is_active', true).eq('listed', true).order('id').range(from, from + 999);
        rows.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
    }
    let hidden = 0;
    const out: { cat: string; item: number; ship: number; tax: number; fee: number; total: number; title: string; zeroShip: boolean }[] = [];
    for (const r of rows) {
        try { const q = priceImport(r, 1, settings); if (isTooCostly(q)) { hidden++; continue; } out.push({ cat: r.category ?? '-', item: q.itemZmw, ship: q.shippingZmw, tax: q.taxesZmw, fee: q.feeZmw, total: q.totalZmw, title: r.title, zeroShip: !(Number(r.shipping_price) > 0) }); } catch { /* not priced */ }
    }
    const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
    const ratio = out.map((o) => o.total / Math.max(1, o.item));
    console.log(`items shown: ${out.length} (${hidden} hidden because shipping is over 3x the item)`);
    console.log(`total ÷ item price: median ${pct(ratio, 0.5).toFixed(2)}×, 90th percentile ${pct(ratio, 0.9).toFixed(2)}×, worst ${Math.max(...ratio).toFixed(2)}×`);
    console.log(`items where the total is more than double the item price: ${out.filter((o) => o.total > 2 * o.item).length} (${Math.round(100 * out.filter((o) => o.total > 2 * o.item).length / out.length)}%)`);
    console.log(`items where duty+VAT alone is more than the item price: ${out.filter((o) => o.tax > o.item).length}`);
    console.log(`items using the per-kg shipping guess (no real shipping figure): ${out.filter((o) => o.zeroShip).length}`);
    const by = new Map<string, typeof out>();
    out.forEach((o) => by.set(o.cat, [...(by.get(o.cat) ?? []), o]));
    console.log('\ncategory | items | median item | median ship | median tax | median fee | median total ÷ item');
    [...by].sort((a, b) => b[1].length - a[1].length).slice(0, 14).forEach(([c, xs]) => console.log(`${c.padEnd(18)} ${String(xs.length).padStart(5)}  K${pct(xs.map((x) => x.item), 0.5).toFixed(0).padStart(6)}  K${pct(xs.map((x) => x.ship), 0.5).toFixed(0).padStart(5)}  K${pct(xs.map((x) => x.tax), 0.5).toFixed(0).padStart(5)}  K${pct(xs.map((x) => x.fee), 0.5).toFixed(0).padStart(4)}  ${pct(xs.map((x) => x.total / Math.max(1, x.item)), 0.5).toFixed(2)}×`));
    console.log('\nthree of the worst:');
    [...out].sort((a, b) => b.total / b.item - a.total / a.item).slice(0, 3).forEach((o) => console.log(`  "${o.title.slice(0, 40)}": item K${o.item.toFixed(0)} + ship K${o.ship.toFixed(0)} + tax K${o.tax.toFixed(0)} + fee K${o.fee.toFixed(0)} = K${o.total.toFixed(0)} (${(o.total / o.item).toFixed(1)}×)`));
    process.exit(0);
})();

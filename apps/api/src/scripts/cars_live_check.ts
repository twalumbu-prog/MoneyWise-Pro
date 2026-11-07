/**
 * Saves a few real cars through the normal admin path and checks the buyer-facing catalogue. With no car cost table set, the cars must
 * be saved but NOT shown with a price. Run: npx tsx src/scripts/cars_live_check.ts [how-many]
 */
import { supabase } from '../lib/supabase';
import { carList } from '../services/imports/web';
import { adminAddFromSource, browse } from '../services/imports.service';

(async () => {
    const n = Number(process.argv[2]) || 3;
    const list = await carList(1);
    let saved = 0;
    for (const c of list) {
        if (saved >= n) break;
        try { const p: any = await adminAddFromSource('WEB', c.sourceId, 'Cars'); saved++; console.log(`saved ${p.title.slice(0, 50)} | $${p.price} + $${p.shipping_price} | specs=${JSON.stringify(p.specs)?.slice(0, 80)}`); }
        catch (e: any) { console.log(`skipped ${c.title.slice(0, 40)}: ${e.message}`); }
    }
    const { data } = await supabase.from('imported_products').select('id, title, listed, is_active').eq('category', 'Cars').eq('source', 'WEB');
    console.log('cars in catalogue:', data?.length);
    const b: any = await browse('toyota', 'Cars');
    const shown = (b.products ?? []).filter((p: any) => /MERCEDES|TOYOTA|HONDA|NISSAN|MAZDA|SUBARU|LEXUS|SUZUKI|AUDI/.test(p.title));
    console.log('cars shown to buyers while costs are unset:', shown.length, '(must be 0)');
    process.exit(shown.length === 0 ? 0 : 1);
})();

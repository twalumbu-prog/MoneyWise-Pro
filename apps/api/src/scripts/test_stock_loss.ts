/** Recording a loss (what happened and who was in charge) and reading the loss log. REAL code, throwaway business. Run: npx tsx src/scripts/test_stock_loss.ts */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { lossLog, writeOff } from '../services/stockBasic.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const code = async (fn: () => Promise<unknown>) => { try { await fn(); return 'OK'; } catch (e: any) { return e?.message ?? 'ERR'; } };

(async () => {
    const tag = randomUUID().slice(0, 6); let org = '';
    try {
        const { data: o, error } = await supabase.from('organizations').insert({ name: `ZZ TEST loss ${tag}`, slug: `zz-test-loss-${tag}` }).select('id').single();
        if (error) throw error; org = o.id;
        const { data: u } = await supabase.from('users').select('id').limit(1).single();
        const { data: s } = await supabase.from('salon_staff_profiles').insert({ organization_id: org, display_name: 'Angel' }).select('id').single();
        const { data: p } = await supabase.from('products').insert({ organization_id: org, name: `ZZ ${tag} Gel`, price: 0, product_type: 'PRODUCT', track_stock: true, stock_quantity: 10, cost_price: 20 }).select('id').single();

        const m: any = await writeOff(org, u!.id, { productId: p!.id, quantity: 2, kind: 'damaged', inChargeStaffId: s!.id, note: 'bottle broke' });
        check('a loss takes the stock out (10 to 8)', Number((await supabase.from('products').select('stock_quantity').eq('id', p!.id).single()).data?.stock_quantity) === 8);
        check('it keeps the kind and who was in charge', m.loss_kind === 'DAMAGED' && m.in_charge_name === 'Angel' && m.in_charge_staff_id === s!.id, JSON.stringify({ k: m.loss_kind, n: m.in_charge_name }));
        await writeOff(org, u!.id, { productId: p!.id, quantity: 1, kind: 'LOST', inChargeName: 'Visitor' });
        await writeOff(org, u!.id, { productId: p!.id, quantity: 1 });
        const log = await lossLog(org);
        check('the log has all three, newest first', log.items.length === 3 && log.items[0].kind === 'OTHER', String(log.items.length));
        check('the total is 4 units worth K80', log.totalUnits === 4 && log.totalValue === 80, JSON.stringify({ u: log.totalUnits, v: log.totalValue }));
        check('totals by person: Angel 2, Visitor 1, nobody named 1', log.byPerson.find((x) => x.name === 'Angel')?.units === 2 && log.byPerson.find((x) => x.name === 'Visitor')?.units === 1 && log.byPerson.find((x) => x.name === 'Nobody named')?.units === 1);
        check('more than is in stock is refused', (await code(() => writeOff(org, u!.id, { productId: p!.id, quantity: 99, kind: 'LOST' }))).includes('Only'));
        check('an ordinary use is not a loss', (await lossLog(org)).items.length === 3);
    } catch (e: any) { console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++; }
    finally {
        if (org) {
            await supabase.from('stock_movements').delete().eq('organization_id', org);
            await supabase.from('products').delete().eq('organization_id', org);
            await supabase.from('salon_staff_profiles').delete().eq('organization_id', org);
            await supabase.from('organizations').delete().eq('id', org);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nAll checks passed'); process.exit(failed ? 1 : 0);
})();

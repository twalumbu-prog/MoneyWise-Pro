/**
 * Checks everyday stock end to end against the real database, with a temporary product it creates and deletes: using stock by colour,
 * restocking with a cost, low-stock listing, spending, and the low/out alerts (the push is stubbed, so nobody is notified).
 * Run: npx tsx src/scripts/test_stock_basic.ts
 */
import 'dotenv/config';
import { supabase } from '../lib/supabase';
import { pushService } from '../services/push.service';
import * as stock from '../services/stockBasic.service';

let failed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${JSON.stringify(extra)}`}`); if (!ok) failed++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rejects = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e: any) { return String(e?.message ?? e); } };

(async () => {
    const ORG = '8f7ee72f-868f-4bcf-9281-4bfc45f3955b';
    const USER = '0cd08494-f960-408d-a373-5e5c00346495';
    const alerts: any[] = [];
    (pushService as any).sendToRoles = async (_org: string, _roles: string[], payload: any) => { alerts.push(payload); };

    const { data: prod, error } = await supabase.from('products').insert({
        organization_id: ORG, name: `TEST extensions ${Date.now()}`, price: 100, product_type: 'PRODUCT', is_active: true, track_stock: true, low_stock_threshold: 2, cost_price: 20,
        variants: [{ id: 'maroon', name: 'Maroon', color: 'Maroon', size: '', stock: 5 }, { id: 'black', name: 'Black', color: 'Black', size: '', stock: 1 }],
    }).select('id').single();
    if (error || !prod) throw new Error(`Could not make the test product: ${error?.message}`);
    const pid = prod.id as string;
    const variantsNow = async () => ((await supabase.from('products').select('variants').eq('id', pid).single()).data?.variants ?? []) as any[];
    const stockOf = async (id: string) => Number((await variantsNow()).find((v) => v.id === id)?.stock);

    try {
        // Using stock by colour
        const used = await stock.useStock(ORG, USER, { productId: pid, variantId: 'maroon', quantity: 3, note: 'Braids for a client' });
        check('using 3 packs of maroon leaves 2 maroon', (await stockOf('maroon')) === 2, await variantsNow());
        check('black is untouched', (await stockOf('black')) === 1);
        check('the use is a movement with its reason, quantity and balance', used.reason === 'USED' && used.quantity_change === -3 && used.balance_after === 2, used);
        check('it was valued at the product cost (3 x K20)', used.valuePosted === 60, used.valuePosted);
        await wait(300);
        check('crossing the low line (5 to 2, level 2) alerts once', alerts.length === 1 && /Running low: .*Maroon/.test(alerts[0].title), alerts);

        // Guards
        check('more than is in stock is refused', /Only 2 in stock/.test((await rejects(() => stock.useStock(ORG, USER, { productId: pid, variantId: 'maroon', quantity: 3 }))) ?? ''));
        check('an option must be named when there are options', !!(await rejects(() => stock.useStock(ORG, USER, { productId: pid, quantity: 1 }))));
        check('a zero or fractional quantity is refused', !!(await rejects(() => stock.useStock(ORG, USER, { productId: pid, variantId: 'maroon', quantity: 0 }))));

        // Running out alerts as out, and using it again does not repeat the alert
        await stock.useStock(ORG, USER, { productId: pid, variantId: 'black', quantity: 1 });
        await wait(300);
        check('running a colour to zero alerts "Out of stock"', alerts.length === 2 && /Out of stock: .*Black/.test(alerts[1].title), alerts);
        await stock.useStock(ORG, USER, { productId: pid, variantId: 'maroon', quantity: 1 });
        await wait(300);
        check('going from low to lower does not alert again', alerts.length === 2, alerts.length);

        // Low list
        const low = await stock.lowStock(ORG);
        const mine = low.rows.filter((r) => r.productId === pid);
        check('the low list names each colour that is low or out', mine.length === 2 && mine.some((r) => r.variantName === 'Black' && r.out) && mine.some((r) => r.variantName === 'Maroon' && !r.out), mine);

        // Restock with a cost, and spending
        const before = (await supabase.from('products').select('cost_price').eq('id', pid).single()).data?.cost_price;
        const bought = await stock.restock(ORG, USER, { productId: pid, variantId: 'maroon', quantity: 10, unitCost: 30, supplier: 'Test Supplies' });
        check('restocking adds the quantity (1 + 10)', (await stockOf('maroon')) === 11, await variantsNow());
        check('it records what it cost: 10 x K30 = K300', bought.spent === 300 && bought.unit_cost === 30, bought);
        const after = Number((await supabase.from('products').select('cost_price').eq('id', pid).single()).data?.cost_price);
        check('the average cost moves with it', Number(before) === 20 && after > 20 && after < 30, { before, after });
        const sp = await stock.spending(ORG);
        const item = sp.byItem.find((i) => i.productId === pid && i.variantId === 'maroon');
        check('spending shows the purchase by item and colour', item?.spent === 300 && item?.quantity === 10 && item?.variantName === 'Maroon', item);
        check('spending shows it by month and in the total', sp.total >= 300 && sp.byMonth.length >= 1);
        check('uses are not counted as spending', !sp.byItem.some((i) => i.productId === pid && i.variantId === 'black'));
    } finally {
        // Accounting entries for a business that has accounting: remove the ones the test posted (their memo names the test product).
        const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', ORG).like('reference_number', 'USE-%').like('description', 'Stock used: TEST extensions%');
        const jeIds = (je ?? []).map((j: any) => j.id);
        if (jeIds.length) { await supabase.from('journal_lines').delete().in('journal_entry_id', jeIds); await supabase.from('journal_entries').delete().in('id', jeIds); }
        await supabase.from('stock_movements').delete().eq('product_id', pid);
        await supabase.from('products').delete().eq('id', pid);
    }
    console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

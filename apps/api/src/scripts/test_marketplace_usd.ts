/**
 * The Marketplace lists a dollar-priced item in kwacha (converted at today's rate, so sorting, filters and checkout keep working) and keeps its
 * dollar price; a kwacha item has no dollar price; the answer carries the rate. Real listings handler against the live database with a
 * throwaway business removed at the end.
 * Run: npx tsx src/scripts/test_marketplace_usd.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { dollarRate, usdToZmw } from '../services/lipila.service';
import { getMarketplaceListings } from '../controllers/marketplace.controller';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

(async () => {
    const tag = randomUUID().slice(0, 6);
    let org = '';
    try {
        const rate = await dollarRate().catch(() => 0);
        if (!(rate > 0)) { console.log('skipped: no dollar rate is set'); return; }
        const { data: o, error } = await supabase.from('organizations').insert({ name: `ZZ TEST mktusd ${tag}`, slug: `zz-test-mktusd-${tag}`, public_username: `zzmkt${tag}`, lenco_subaccount_id: randomUUID() }).select('id').single();
        if (error) throw error; org = o.id;
        const { data: w } = await supabase.from('organization_wallets').insert({ organization_id: org, name: 'Main', is_main: true }).select('id').single();
        const mk = async (name: string, price: number, currency: 'USD' | 'ZMW') => { const { data, error: e } = await supabase.from('products').insert({ organization_id: org, wallet_id: w!.id, name, price, currency, product_type: 'PRODUCT', is_active: true, marketplace_listed: true }).select('id').single(); if (e) throw e; return data!.id as string; };
        const D = await mk(`ZZ ${tag} Course`, 50, 'USD'); const K = await mk(`ZZ ${tag} Cake`, 100, 'ZMW');

        const out: { code: number; body: any } = { code: 200, body: null };
        const res: any = { status(n: number) { out.code = n; return this; }, json(b: any) { out.body = b; return this; } };
        await getMarketplaceListings({ user: null } as any, res);
        const list: any[] = out.body?.listings ?? [];
        const d = list.find((l) => l.id === D); const k = list.find((l) => l.id === K);
        check('the dollar item is listed with its price in kwacha at today\'s rate', !!d && d.price === usdToZmw(50, rate), JSON.stringify(d && { price: d.price, usdPrice: d.usdPrice }));
        check('and keeps its own dollar price ($50)', d?.usdPrice === 50);
        check('a kwacha item is listed as it is, with no dollar price', !!k && k.price === 100 && k.usdPrice === null, JSON.stringify(k && { price: k.price, usdPrice: k.usdPrice }));
        check('the answer carries the dollar rate for the converter', out.body?.dollarRate === rate, String(out.body?.dollarRate));
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        if (org) {
            await supabase.from('products').delete().eq('organization_id', org);
            await supabase.from('organization_wallets').delete().eq('organization_id', org);
            const { error: delErr } = await supabase.from('organizations').delete().eq('id', org);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST mktusd ${tag}`);
            console.log(`cleanup: ${count ?? 0} test businesses left${delErr ? ` (${delErr.message.slice(0, 80)})` : ''}`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();

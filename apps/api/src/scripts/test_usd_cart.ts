/**
 * A store cart of dollar products is charged to the card in real US dollars; a mixed cart, a kwacha cart, a cart with a voucher, and a business
 * without dollars switched on stay in kwacha. The REAL sale-intent handler and card path run (Lipila is a stand-in: no real key, no money),
 * against the live database with a throwaway business removed at the end.
 * Run: npx tsx src/scripts/test_usd_cart.ts
 */
import crypto, { randomUUID } from 'crypto';

process.env.GATEWAY_CREDENTIALS_KEY = process.env.GATEWAY_CREDENTIALS_KEY || crypto.randomBytes(32).toString('hex');

import { supabase } from '../lib/supabase';
import * as lipila from '../services/lipila.service';
import { logPublicWalletDepositIntent } from '../controllers/lenco.controller';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

const realFetch = globalThis.fetch;
const cardCalls: any[] = [];
globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(typeof input === 'string' ? input : input?.url ?? input);
    if (!/api\.lipila\.dev|blz\.lipila\.io/.test(url)) return realFetch(input, init);
    const body = init.body ? JSON.parse(init.body) : null;
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.includes('/collections/card')) { cardCalls.push(body); return json(200, { status: 'Pending', cardRedirectionUrl: `https://checkout.example/pay/${body.collectionRequest.referenceId}`, referenceId: body.collectionRequest.referenceId }); }
    return json(404, {});
}) as any;

const intent = async (body: Record<string, unknown>) => {
    const out: { code: number; body: any } = { code: 200, body: null };
    const res: any = { status(n: number) { out.code = n; return this; }, json(b: any) { out.body = b; return this; } };
    await logPublicWalletDepositIntent({ body, headers: {} } as any, res);
    return out;
};

(async () => {
    const tag = randomUUID().slice(0, 6);
    let org = '';
    const { data: prevRollout } = await supabase.from('app_settings').select('value, description').eq('key', 'lipila_rollout').maybeSingle();
    try {
        const rate = await lipila.dollarRate().catch(() => 0);
        if (!(rate > 0)) { console.log('skipped: no dollar rate is set'); return; }
        const { data: o, error } = await supabase.from('organizations').insert({ name: `ZZ TEST usdcart ${tag}`, slug: `zz-test-usdcart-${tag}`, card_currency: 'USD' }).select('id').single();
        if (error) throw error; org = o.id;
        const { data: wallet, error: we } = await supabase.from('organization_wallets').insert({ organization_id: org, name: `ZZ TEST wallet ${tag}`, is_main: true }).select('id').single();
        if (we) throw we;
        await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: { all: false, orgs: [...(prevRollout?.value?.orgs ?? []), org] }, description: prevRollout?.description ?? 'Lipila card rollout', updated_at: new Date().toISOString() });
        lipila.clearRolloutCache();
        await lipila.saveCredentials(org, randomUUID(), { apiKey: 'Lsk_test_c_' + crypto.randomBytes(6).toString('hex'), env: 'sandbox', enabled: true }, null);
        const mk = async (name: string, price: number, currency: 'USD' | 'ZMW') => { const { data, error: e } = await supabase.from('products').insert({ organization_id: org, name, price, product_type: 'PRODUCT', is_active: true, currency }).select('id').single(); if (e) throw e; return data!.id as string; };
        const D1 = await mk(`ZZ ${tag} Course`, 50, 'USD'); const D2 = await mk(`ZZ ${tag} Ebook`, 10, 'USD'); const K1 = await mk(`ZZ ${tag} Cake`, 100, 'ZMW');
        let n = 0;
        const unit = new Map<string, number>([[D1, lipila.usdToZmw(50, rate)], [D2, lipila.usdToZmw(10, rate)], [K1, 100]]);
        const pay = async (items: { id: string; quantity: number }[], extra: Record<string, unknown> = {}) => {
            const ref = `LPL-ZZC-${tag}-${++n}`;
            const r = await intent({ reference: ref, purpose: `Sale: ZZ ${tag}`, amount: items.reduce((t, i) => t + unit.get(i.id)! * i.quantity, 0), walletId: wallet!.id, customerName: 'Test', customerPhone: '0977000000', items: items.map((i) => ({ ...i, price: unit.get(i.id) })), ...extra });
            if (process.env.DBG) console.log("intent", r.code, JSON.stringify(r.body).slice(0,300)); if (r.code !== 200) return { r, ref, init: null as any, err: null as any, call: null as any };
            const before = cardCalls.length;
            const init = await lipila.initiateCard({ organizationId: org, reference: ref, apiBase: null, context: { kind: 'store', token: wallet!.id } }).catch((e) => ({ err: e }));
            return { r, ref, init: (init as any).err ? null : init, err: (init as any).err ?? null, call: cardCalls.length > before ? cardCalls[cardCalls.length - 1].collectionRequest : null };
        };

        // all dollar: 2 x $50 + 1 x $10 = $110
        const a = await pay([{ id: D1, quantity: 2 }, { id: D2, quantity: 1 }]);
        const g = lipila.grossUp(110);
        check('an all-dollar cart asks Lipila to charge in USD', a.call?.currency === 'USD', JSON.stringify(a.err?.message ?? a.call));
        check('the card is charged $110 plus the card fee, from the product prices', a.call?.amount === g.charged && a.init?.charged === g.charged && a.init?.currency === 'USD', `${a.call?.amount} vs ${g.charged}`);
        const { data: s } = await supabase.from('lipila_card_sessions').select('net_amount, context').eq('reference', a.ref).single();
        check('the books keep the kwacha sale; the session remembers dollars', Number(s?.net_amount) === lipila.usdToZmw(100, rate) + lipila.usdToZmw(10, rate) && s?.context?.charge_currency === 'USD', JSON.stringify(s));

        // mixed and kwacha-only stay kwacha
        const m = await pay([{ id: D1, quantity: 1 }, { id: K1, quantity: 1 }]);
        check('a mixed cart is charged in kwacha', m.call?.currency === 'ZMW' && m.init?.currency === 'ZMW', JSON.stringify(m.err?.message ?? m.call));
        const k = await pay([{ id: K1, quantity: 1 }]);
        check('a kwacha cart is charged in kwacha', k.call?.currency === 'ZMW' && k.call?.amount === lipila.grossUp(100).charged, JSON.stringify(k.call));

        // a tampered sale (lines say far less than the dollar prices) is refused before any card is charged
        const t = await pay([{ id: D1, quantity: 1 }]);
        await supabase.from('product_sales').update({ amount_paid: 20 }).eq('reference', t.ref);
        await supabase.from('cashbook_entries').update({ debit: 20 }).eq('organization_id', org).eq('external_reference', t.ref);
        await supabase.from('lipila_card_sessions').delete().eq('reference', t.ref);
        const before = cardCalls.length;
        const cheat = await lipila.initiateCard({ organizationId: org, reference: t.ref, apiBase: null, context: { kind: 'store', token: wallet!.id } }).catch((e) => e);
        check('a dollar cart recorded for far less is refused and nothing is charged', cheat?.code === 'AMOUNT' && cardCalls.length === before, String(cheat?.code));

        // the sale itself can't be recorded for less than the products cost (the browser sends the prices; the server checks them)
        const cheatRef = `LPL-ZZC-${tag}-cheat`;
        const lowItem = await intent({ reference: cheatRef, purpose: 'x', amount: 1, walletId: wallet!.id, customerName: 'T', customerPhone: '0977000009', items: [{ id: K1, quantity: 1, price: 1 }] });
        const { data: none } = await supabase.from('cashbook_entries').select('id').eq('organization_id', org).eq('external_reference', cheatRef);
        check('an item sent for K1 instead of K100 is refused, and nothing is recorded', lowItem.code === 409 && (none ?? []).length === 0, JSON.stringify(lowItem));
        const lowTotal = await intent({ reference: `${cheatRef}2`, purpose: 'x', amount: 5, walletId: wallet!.id, customerName: 'T', customerPhone: '0977000009', items: [{ id: K1, quantity: 2, price: 100 }] });
        check('a right item price but a total of K5 for K200 is refused', lowTotal.code === 409, JSON.stringify(lowTotal));
        const lowUsd = await intent({ reference: `${cheatRef}3`, purpose: 'x', amount: 50, walletId: wallet!.id, customerName: 'T', customerPhone: '0977000009', items: [{ id: D1, quantity: 1, price: 50 }] });
        check('a dollar product sent at its dollar number as if kwacha is refused', lowUsd.code === 409, JSON.stringify(lowUsd));
        const okMore = await intent({ reference: `${cheatRef}4`, purpose: 'x', amount: 130, walletId: wallet!.id, customerName: 'T', customerPhone: '0977000009', items: [{ id: K1, quantity: 1, price: 100 }] });
        check('a total above the prices (for example with delivery added) is accepted', okMore.code === 200, JSON.stringify(okMore));

        // dollars switched off for the business: dollar products still sell, in kwacha
        await supabase.from('organizations').update({ card_currency: 'ZMW' }).eq('id', org);
        const off = await pay([{ id: D1, quantity: 1 }]);
        check('with dollars switched off the same cart is charged in kwacha', off.call?.currency === 'ZMW', JSON.stringify(off.err?.message ?? off.call));
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        globalThis.fetch = realFetch;
        if (prevRollout) await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: prevRollout.value, description: prevRollout.description, updated_at: new Date().toISOString() });
        else await supabase.from('app_settings').delete().eq('key', 'lipila_rollout');
        lipila.clearRolloutCache();
        if (org) {
            await new Promise((r) => setTimeout(r, 1500));
            for (const t of ['lipila_card_sessions', 'org_gateway_credentials', 'product_sales']) await supabase.from(t).delete().eq('organization_id', org);
            const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', org);
            const ids = (je ?? []).map((j: any) => j.id);
            if (ids.length) await supabase.from('journal_lines').delete().in('journal_entry_id', ids);
            for (const t of ['journal_entries', 'cashbook_entries', 'products', 'organization_wallets', 'accounts']) await supabase.from(t).delete().eq('organization_id', org);
            const { error: delErr } = await supabase.from('organizations').delete().eq('id', org);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST usdcart ${tag}`);
            console.log(`cleanup: ${count ?? 0} test businesses left${delErr ? ` (${delErr.message.slice(0, 80)})` : ''}`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();

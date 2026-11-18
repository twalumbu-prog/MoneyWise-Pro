/**
 * A payment link priced in US dollars is charged to the card in real dollars; a kwacha link still in kwacha. Lipila is replaced by a stand-in
 * (no real key, no real money); everything else is real, against the live database with a throwaway business removed at the end.
 * Run: npx tsx src/scripts/test_usd_charge.ts
 */
import crypto, { randomUUID } from 'crypto';

process.env.GATEWAY_CREDENTIALS_KEY = process.env.GATEWAY_CREDENTIALS_KEY || crypto.randomBytes(32).toString('hex');

import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import * as lipila from '../services/lipila.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

const realFetch = globalThis.fetch;
const cardCalls: any[] = [];
globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(typeof input === 'string' ? input : input?.url ?? input);
    if (!/api\.lipila\.dev|blz\.lipila\.io/.test(url)) return realFetch(input, init);
    const body = init.body ? JSON.parse(init.body) : null;
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.includes('/collections/card')) {
        cardCalls.push(body);
        return json(200, { status: 'Pending', cardRedirectionUrl: `https://checkout.example/pay/${body.collectionRequest.referenceId}`, referenceId: body.collectionRequest.referenceId });
    }
    return json(404, {});
}) as any;

(async () => {
    const tag = randomUUID().slice(0, 6);
    let org = '';
    const { data: prevRollout } = await supabase.from('app_settings').select('value, description').eq('key', 'lipila_rollout').maybeSingle();
    try {
        const rate = await lipila.dollarRate().catch(() => 0);
        if (!(rate > 0)) { console.log('skipped: no dollar rate is set'); return; }
        const { data: o, error } = await supabase.from('organizations').insert({ name: `ZZ TEST usd ${tag}`, slug: `zz-test-usd-${tag}`, card_currency: 'USD' }).select('id').single();
        if (error) throw error; org = o.id;
        await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: { all: false, orgs: [...(prevRollout?.value?.orgs ?? []), org] }, description: prevRollout?.description ?? 'Lipila card rollout', updated_at: new Date().toISOString() });
        lipila.clearRolloutCache();
        await lipila.saveCredentials(org, randomUUID(), { apiKey: 'Lsk_test_usd_' + crypto.randomBytes(6).toString('hex'), env: 'sandbox', enabled: true }, null);

        const link = async (currency: 'USD' | 'ZMW', price: number) => {
            const token = `zz${crypto.randomBytes(8).toString('hex')}`;
            const zmw = currency === 'USD' ? lipila.usdToZmw(price, rate) : price;
            const { error: e } = await supabase.from('payment_links').insert({ organization_id: org, product_id: null, token, customer_name: 'Test', customer_phone: '0977000000', amount: zmw, status: 'ACTIVE', ...(currency === 'USD' ? { currency: 'USD', foreign_amount: price } : {}) });
            if (e) throw e;
            const ref = `LPL-DEP-${Date.now()}-${randomUUID().slice(0, 6)}-PL`;
            await cashbookService.createEntry(org, { date: new Date().toISOString().split('T')[0], description: `PENDING_INTENT: Sale: Test | Cust: 0977000000 | Ref: ${ref}`, debit: zmw, credit: 0, entry_type: 'INFLOW', account_type: 'MONEYWISE_WALLET', status: 'PENDING', external_reference: ref, wallet_id: null } as any);
            return { token, ref, zmw };
        };

        const usd = await link('USD', 50);
        const r1 = await lipila.initiateCard({ organizationId: org, reference: usd.ref, apiBase: null, context: { kind: 'payment_link', token: usd.token } });
        const c1 = cardCalls[cardCalls.length - 1].collectionRequest;
        const g = lipila.grossUp(50);
        check('a dollar link asks Lipila to charge in USD', c1.currency === 'USD', c1.currency);
        check('the card is charged the dollar price plus the card fee', c1.amount === g.charged && r1.charged === g.charged && r1.fee === g.fee && r1.currency === 'USD', `${c1.amount} vs ${g.charged}`);
        const { data: s1 } = await supabase.from('lipila_card_sessions').select('net_amount, charged_amount, context').eq('reference', usd.ref).single();
        check('the books keep the kwacha sale and the session remembers dollars', Number(s1!.net_amount) === usd.zmw && s1!.context?.charge_currency === 'USD', JSON.stringify(s1));
        const again = await lipila.initiateCard({ organizationId: org, reference: usd.ref, apiBase: null });
        check('asking again returns the same card page, still in dollars', again.redirectUrl === r1.redirectUrl && again.currency === 'USD');

        const zmw = await link('ZMW', 100);
        const r2 = await lipila.initiateCard({ organizationId: org, reference: zmw.ref, apiBase: null, context: { kind: 'payment_link', token: zmw.token } });
        const c2 = cardCalls[cardCalls.length - 1].collectionRequest;
        check('a kwacha link is still charged in ZMW', c2.currency === 'ZMW' && c2.amount === lipila.grossUp(100).charged && r2.currency === 'ZMW', `${c2.currency} ${c2.amount}`);

        // A sale recorded for far less than the link's dollar price must be refused before any card is charged.
        const cheat = await link('USD', 50);
        await supabase.from('cashbook_entries').delete().eq('organization_id', org).eq('external_reference', cheat.ref);
        await cashbookService.createEntry(org, { date: new Date().toISOString().split('T')[0], description: `PENDING_INTENT: Sale: Test | Ref: ${cheat.ref}`, debit: 10, credit: 0, entry_type: 'INFLOW', account_type: 'MONEYWISE_WALLET', status: 'PENDING', external_reference: cheat.ref, wallet_id: null } as any);
        const before = cardCalls.length;
        let code = '';
        try { await lipila.initiateCard({ organizationId: org, reference: cheat.ref, apiBase: null, context: { kind: 'payment_link', token: cheat.token } }); } catch (e: any) { code = e?.code; }
        check('a tampered amount on a dollar link is refused and nothing is charged', code === 'AMOUNT' && cardCalls.length === before, code);

        const list = await lipila.recentCardPayments(org);
        const row = list.find((p) => p.reference === usd.ref);
        check('the payment list says which currency the card was charged in', row?.chargeCurrency === 'USD' && list.find((p) => p.reference === zmw.ref)?.chargeCurrency === 'ZMW');
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        globalThis.fetch = realFetch;
        if (prevRollout) await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: prevRollout.value, description: prevRollout.description, updated_at: new Date().toISOString() });
        else await supabase.from('app_settings').delete().eq('key', 'lipila_rollout');
        lipila.clearRolloutCache();
        if (org) {
            await new Promise((r) => setTimeout(r, 1500));
            await supabase.from('lipila_card_sessions').delete().eq('organization_id', org);
            await supabase.from('org_gateway_credentials').delete().eq('organization_id', org);
            await supabase.from('payment_links').delete().eq('organization_id', org);
            const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', org);
            const ids = (je ?? []).map((j: any) => j.id);
            if (ids.length) await supabase.from('journal_lines').delete().in('journal_entry_id', ids);
            await supabase.from('journal_entries').delete().eq('organization_id', org);
            await supabase.from('cashbook_entries').delete().eq('organization_id', org);
            await supabase.from('accounts').delete().eq('organization_id', org);
            const { error: delErr } = await supabase.from('organizations').delete().eq('id', org);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST usd ${tag}`);
            console.log(`cleanup: ${count ?? 0} test businesses left${delErr ? ` (${delErr.message.slice(0, 80)})` : ''}`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();

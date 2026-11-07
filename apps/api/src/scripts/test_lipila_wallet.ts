/**
 * The Lipila wallet shown on the Wallets page: live balance (with Lipila stood in), what is recorded in MoneyWise, and the card payment list.
 * Uses a throwaway business, removed at the end. Run: npx tsx src/scripts/test_lipila_wallet.ts
 */
import crypto, { randomUUID } from 'crypto';

process.env.GATEWAY_CREDENTIALS_KEY = process.env.GATEWAY_CREDENTIALS_KEY || crypto.randomBytes(32).toString('hex');

import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import * as lipila from '../services/lipila.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

const realFetch = globalThis.fetch;
let balanceAnswer: { status: number; body?: any; throws?: boolean } = { status: 200, body: { success: true, data: { balance: 1234.5 } } };
const balanceCalls: Record<string, string>[] = [];
globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(typeof input === 'string' ? input : input?.url ?? input);
    if (!/api\.lipila\.dev|blz\.lipila\.io/.test(url)) return realFetch(input, init);
    if (url.includes('/merchants/balance')) {
        balanceCalls.push(Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)])));
        if (balanceAnswer.throws) throw new Error('network down');
        return new Response(JSON.stringify(balanceAnswer.body ?? {}), { status: balanceAnswer.status, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
}) as any;

(async () => {
    const tag = randomUUID().slice(0, 6);
    const KEY = 'Lsk_wallet_' + crypto.randomBytes(8).toString('hex');
    let org = ''; let other = '';
    const { data: prev } = await supabase.from('app_settings').select('value, description').eq('key', 'lipila_rollout').maybeSingle();
    try {
        const mk = async (n: string) => { const { data, error } = await supabase.from('organizations').insert({ name: `ZZ TEST wallet ${n} ${tag}`, slug: `zz-test-wallet-${n}-${tag}` }).select('id').single(); if (error) throw error; return data.id as string; };
        org = await mk('a'); other = await mk('b');
        await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: { all: false, orgs: [...(prev?.value?.orgs ?? []), org, other] }, description: prev?.description ?? 'Lipila card rollout', updated_at: new Date().toISOString() });
        lipila.clearRolloutCache();

        check('no tile before a key is saved', (await lipila.walletConnected(org)) === false);
        const empty = await lipila.walletSummary(org);
        check('a business with no key gets a clear answer, not an error', empty.connected === false && !!empty.error && empty.balance === null);

        await lipila.saveCredentials(org, randomUUID(), { apiKey: KEY, env: 'sandbox', enabled: false }, null);
        check('the tile shows once a key is saved, even with cards switched off', (await lipila.walletConnected(org)) === true);
        check('a business outside the rollout gets no tile', (await lipila.walletConnected(randomUUID())) === false);

        const s1 = await lipila.walletSummary(org);
        check('the balance is Lipila’s own figure, asked with this business’s key', s1.balance === 1234.5 && s1.connected && s1.env === 'sandbox' && !s1.error && balanceCalls.at(-1)?.['x-api-key'] === KEY, JSON.stringify(s1));

        balanceAnswer = { status: 200, body: { data: { availableBalance: 99.99, bookedBalance: 120 } } };
        const s2 = await lipila.walletSummary(org);
        check('another answer shape is understood, with the booked balance', s2.balance === 99.99 && s2.booked === 120, JSON.stringify([s2.balance, s2.booked]));
        balanceAnswer = { status: 200, body: { balance: '50.5' } };
        check('a balance sent as text is read', (await lipila.walletSummary(org)).balance === 50.5);
        balanceAnswer = { status: 200, body: { success: true } };
        const s3 = await lipila.walletSummary(org);
        check('an answer with no balance says so instead of showing zero', s3.balance === null && /balance/i.test(s3.error ?? ''));
        balanceAnswer = { status: 401, body: { message: 'Unauthorized' } };
        const s4 = await lipila.walletSummary(org);
        check('a refused key is explained', s4.balance === null && /refused/i.test(s4.error ?? ''));
        balanceAnswer = { status: 503, body: {} };
        check('Lipila being down is reported', /503/.test((await lipila.walletSummary(org)).error ?? ''));
        balanceAnswer = { status: 200, throws: true };
        const s5 = await lipila.walletSummary(org);
        check('no connection to Lipila is reported, and nothing throws', s5.balance === null && /reach/i.test(s5.error ?? ''));

        // what is recorded in the books on the Lipila wallet
        const date = new Date().toISOString().split('T')[0];
        for (const [amt, ref] of [[100, 'LPL-w1'], [250.5, 'LPL-w2']] as const) {
            await cashbookService.createEntry(org, { date, description: `Card sale ${ref}`, debit: amt, credit: 0, entry_type: 'INFLOW', account_type: lipila.CARD_ACCOUNT_TYPE, status: 'UNACCOUNTED', wallet_id: null, external_reference: ref } as any);
        }
        const s6 = await lipila.walletSummary(org);
        check('card sales recorded in MoneyWise are totalled', s6.recordedSales === 350.5, String(s6.recordedSales));
        check('the overview’s balance for the tile matches', (await cashbookService.getCurrentBalance(org, lipila.CARD_ACCOUNT_TYPE)) === 350.5);
        const mine = await cashbookService.getEntries(org, { accountType: lipila.CARD_ACCOUNT_TYPE });
        check('the wallet’s transactions are the card sales', mine.length === 2);
        check('another business sees none of it', (await lipila.walletSummary(other)).recordedSales === 0 && (await cashbookService.getEntries(other, { accountType: lipila.CARD_ACCOUNT_TYPE })).length === 0);

        // the card payment list, including the ones that didn't complete
        const base = { organization_id: org, currency: 'ZMW', fee_amount: 4.17, charged_amount: 104.17, net_amount: 100, customer: { name: 'Mary Banda', phone: '0977000000' } };
        await supabase.from('lipila_card_sessions').insert([
            { ...base, reference: `LPL-a-${tag}`, status: 'SUCCESSFUL', context: { kind: 'payment_link' }, created_at: new Date(Date.now() - 3000).toISOString() },
            { ...base, reference: `LPL-b-${tag}`, status: 'FAILED', failure_reason: 'Card declined', context: { kind: 'quick_link' }, created_at: new Date(Date.now() - 2000).toISOString() },
            { ...base, reference: `LPL-c-${tag}`, status: 'INITIATED', context: { kind: 'payment_link' }, created_at: new Date(Date.now() - 1000).toISOString() },
            { ...base, reference: `LPL-d-${tag}`, status: 'INITIATED', record_error: 'ledger write failed', context: {}, created_at: new Date().toISOString() },
        ]);
        await supabase.from('lipila_card_sessions').insert({ ...base, organization_id: other, reference: `LPL-x-${tag}`, status: 'SUCCESSFUL', context: {} }).then(() => undefined, () => undefined);
        const list = await lipila.recentCardPayments(org);
        check('every card payment is listed, newest first, including declined and waiting', list.length === 4 && list[0].reference === `LPL-d-${tag}` && list.map((p) => p.status).join() === 'INITIATED,INITIATED,FAILED,SUCCESSFUL', list.map((p) => p.status).join());
        check('amounts, customer and source are shown', list[3].net === 100 && list[3].charged === 104.17 && list[3].fee === 4.17 && list[3].customer === 'Mary Banda' && list[3].source === 'payment_link');
        check('a decline carries its reason, and a recording problem is flagged', list[2].reason === 'Card declined' && !!list[0].problem);
        check('the list holds only this business’s payments', list.every((p) => p.reference.includes(tag) && !p.reference.startsWith('LPL-x')));
        check('a limit is respected', (await lipila.recentCardPayments(org, 2)).length === 2);
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        globalThis.fetch = realFetch;
        if (prev) await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: prev.value, description: prev.description, updated_at: new Date().toISOString() });
        else await supabase.from('app_settings').delete().eq('key', 'lipila_rollout');
        lipila.clearRolloutCache();
        const ids = [org, other].filter(Boolean);
        if (ids.length) {
            await new Promise((r) => setTimeout(r, 1500));
            await supabase.from('lipila_card_sessions').delete().in('organization_id', ids);
            await supabase.from('org_gateway_credentials').delete().in('organization_id', ids);
            const { data: je } = await supabase.from('journal_entries').select('id').in('organization_id', ids); const jids = (je ?? []).map((j: any) => j.id);
            if (jids.length) await supabase.from('journal_lines').delete().in('journal_entry_id', jids);
            await supabase.from('journal_entries').delete().in('organization_id', ids);
            await supabase.from('cashbook_entries').delete().in('organization_id', ids);
            await supabase.from('accounts').delete().in('organization_id', ids);
            await supabase.from('organizations').delete().in('id', ids);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST wallet % ${tag}`);
            console.log(`cleanup: ${count ?? 0} test businesses left`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();

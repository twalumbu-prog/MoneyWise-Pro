/**
 * Card deposit into the Card Wallet, and the Main Wallet showing Lenco's live balance. Lipila and Lenco are stood in; the database is live,
 * with a throwaway business removed at the end. Run: npx tsx src/scripts/test_card_deposit_and_live_balance.ts
 */
import crypto, { randomUUID } from 'crypto';

process.env.GATEWAY_CREDENTIALS_KEY = process.env.GATEWAY_CREDENTIALS_KEY || crypto.randomBytes(32).toString('hex');

import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { LencoService } from '../services/lenco.service';
import * as lipila from '../services/lipila.service';
import { applyLiveBalance, liveLencoBalance, clearLiveBalanceCache } from '../services/liveWalletBalance.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

const realFetch = globalThis.fetch;
let lipilaOutcome: 'successful' | 'failed' | 'pending' = 'pending';
let cardCalls = 0;
globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(typeof input === 'string' ? input : input?.url ?? input);
    if (!/api\.lipila\.dev|blz\.lipila\.io/.test(url)) return realFetch(input, init);
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.includes('/collections/card')) { cardCalls++; const b = JSON.parse(init.body); return json(200, { status: 'Pending', cardRedirectionUrl: `https://checkout.example/pay/${b.collectionRequest.referenceId}`, referenceId: b.collectionRequest.referenceId }); }
    if (url.includes('/collections/check-status')) return json(200, { status: lipilaOutcome === 'successful' ? 'Successful' : lipilaOutcome === 'failed' ? 'Failed' : 'Pending', message: lipilaOutcome === 'failed' ? 'Card declined' : undefined });
    return json(404, {});
}) as any;

(async () => {
    const tag = randomUUID().slice(0, 6);
    let org = '';
    const { data: prev } = await supabase.from('app_settings').select('value, description').eq('key', 'lipila_rollout').maybeSingle();
    const realBalance = LencoService.getAccountBalance;
    try {
        // ---- the Main Wallet figure
        const wallets = [{ id: 'm', is_main: true, balance: 1932.39 }, { id: 's', is_main: false, balance: 0 }];
        const live = applyLiveBalance(wallets, { available: 900.5, currency: 'ZMW', at: Date.now() });
        check('the Main Wallet shows Lenco’s live figure', live[0].balance === 900.5 && live[0].balance_source === 'LENCO_LIVE');
        check('the books figure and the gap are kept beside it', live[0].ledger_balance === 1932.39 && live[0].balance_difference === -1031.89);
        check('other wallets stay on the books', live[1].balance === 0 && live[1].balance_source === 'BOOKS');
        const withSlice = applyLiveBalance([{ is_main: true, balance: 500 }, { is_main: false, balance: 100 }], { available: 600, currency: 'ZMW', at: 0 });
        check('slices held in other wallets are taken out of the Main Wallet', withSlice[0].balance === 500);
        const noLive = applyLiveBalance(wallets, null);
        check('when Lenco can’t be asked, the books figure is shown', noLive[0].balance === 1932.39 && noLive[0].balance_source === 'BOOKS');

        const { data: o, error: oe } = await supabase.from('organizations').insert({ name: `ZZ TEST carddep ${tag}`, slug: `zz-test-carddep-${tag}`, lenco_subaccount_id: randomUUID(), payment_test_mode: false }).select('id').single();
        if (oe) throw oe; org = o!.id;
        (LencoService as any).getAccountBalance = async () => ({ availableBalance: '912.34', currency: 'ZMW' });
        clearLiveBalanceCache();
        const l1 = await liveLencoBalance(org);
        check('Lenco’s balance is read (text amounts too)', l1?.available === 912.34);
        (LencoService as any).getAccountBalance = async () => { throw new Error('down'); };
        clearLiveBalanceCache();
        check('Lenco being down gives no figure rather than an error', (await liveLencoBalance(org)) === null);
        await supabase.from('organizations').update({ payment_test_mode: true }).eq('id', org);
        (LencoService as any).getAccountBalance = async () => ({ availableBalance: 5 });
        clearLiveBalanceCache();
        check('a business in test mode never uses live balances', (await liveLencoBalance(org)) === null);
        (LencoService as any).getAccountBalance = realBalance;

        // ---- the card deposit
        await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: { all: false, orgs: [...(prev?.value?.orgs ?? []), org] }, description: prev?.description ?? 'Lipila card rollout', updated_at: new Date().toISOString() });
        lipila.clearRolloutCache();
        const user = randomUUID();
        let err = '';
        try { await lipila.initiateDeposit({ organizationId: org, userId: user, amount: 100, apiBase: null }); } catch (e: any) { err = e.message; }
        check('a deposit is refused until cards are switched on', /aren.t available|set up/i.test(err), err);

        await lipila.saveCredentials(org, user, { apiKey: 'Lsk_dep_' + crypto.randomBytes(6).toString('hex'), env: 'sandbox', enabled: true }, null);
        for (const bad of [5, 0, -20, 'abc', 90000]) {
            let m = ''; try { await lipila.initiateDeposit({ organizationId: org, userId: user, amount: bad, apiBase: null }); } catch (e: any) { m = e.message; }
            check(`an amount of ${bad} is refused`, /smallest|largest/.test(m), m);
        }
        check('nothing was charged for the refused amounts', cardCalls === 0);

        const dep = await lipila.initiateDeposit({ organizationId: org, userId: user, amount: 100, apiBase: 'https://api.example', returnUrl: 'https://app.example' });
        check('a deposit returns a card page and a reference', !!dep.redirectUrl && dep.reference.startsWith('LPL-DEP-'));
        check('the card is charged the amount plus the card fee', Math.abs(dep.charged - 104.17) < 0.011 && Math.abs(dep.fee - 4.17) < 0.011, JSON.stringify([dep.charged, dep.fee]));
        const { data: sess } = await supabase.from('lipila_card_sessions').select('*').eq('reference', dep.reference).single();
        check('the session remembers it as a deposit for this business', sess?.organization_id === org && sess?.context?.kind === 'deposit' && Number(sess?.net_amount) === 100);

        lipilaOutcome = 'pending';
        check('while the card is unpaid nothing is booked', (await lipila.finalizeCard(dep.reference)).state === 'pending' && (await cashbookService.getCurrentBalance(org, lipila.CARD_ACCOUNT_TYPE)) === 0);
        lipilaOutcome = 'successful';
        const done = await lipila.finalizeCard(dep.reference);
        check('a paid card is recorded', done.state === 'successful');
        check('the Card Wallet holds exactly the deposit, not the fee', (await cashbookService.getCurrentBalance(org, lipila.CARD_ACCOUNT_TYPE)) === 100);
        await lipila.finalizeCard(dep.reference);
        check('asking again never books it twice', (await cashbookService.getCurrentBalance(org, lipila.CARD_ACCOUNT_TYPE)) === 100);
        const { data: ents } = await supabase.from('cashbook_entries').select('account_type, status').eq('organization_id', org).eq('external_reference', dep.reference);
        check('it is on the Card Wallet only, not the Lenco wallet', (ents ?? []).length === 1 && ents![0].account_type === lipila.CARD_ACCOUNT_TYPE);

        lipilaOutcome = 'failed';
        const dep2 = await lipila.initiateDeposit({ organizationId: org, userId: user, amount: 50, apiBase: null });
        const bad = await lipila.finalizeCard(dep2.reference);
        check('a declined card is reported and books nothing', bad.state === 'failed' && (await cashbookService.getCurrentBalance(org, lipila.CARD_ACCOUNT_TYPE)) === 100);
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        globalThis.fetch = realFetch;
        (LencoService as any).getAccountBalance = realBalance;
        if (prev) await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: prev.value, description: prev.description, updated_at: new Date().toISOString() });
        else await supabase.from('app_settings').delete().eq('key', 'lipila_rollout');
        lipila.clearRolloutCache();
        if (org) {
            await new Promise((r) => setTimeout(r, 1500));
            await supabase.from('lipila_card_sessions').delete().eq('organization_id', org);
            await supabase.from('org_gateway_credentials').delete().eq('organization_id', org);
            const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', org); const jids = (je ?? []).map((j: any) => j.id);
            if (jids.length) await supabase.from('journal_lines').delete().in('journal_entry_id', jids);
            await supabase.from('journal_entries').delete().eq('organization_id', org);
            await supabase.from('cashbook_entries').delete().eq('organization_id', org);
            await supabase.from('accounts').delete().eq('organization_id', org);
            await supabase.from('organizations').delete().eq('id', org);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST carddep ${tag}`);
            console.log(`cleanup: ${count ?? 0} test businesses left`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();

/**
 * Paying a requisition out of the Card Wallet (Lipila). Lipila is stood in; the database is live, with a throwaway business and its
 * requisitions removed at the end. It runs the real disburse handler and the real settlement, and checks the rules that keep money safe:
 * refusals send nothing, a definite refusal leaves no record, an unclear answer is never sent again, one unconfirmed payout blocks the next,
 * a double click is stopped, Lipila's charge is added on top and booked once, and only Lipila's own word moves the books.
 * Run: npx tsx src/scripts/test_card_payout.ts   (about 10 seconds: one case waits for the "no answer" re-checks)
 */
import crypto, { randomUUID } from 'crypto';

process.env.GATEWAY_CREDENTIALS_KEY = process.env.GATEWAY_CREDENTIALS_KEY || crypto.randomBytes(32).toString('hex');

import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import * as lipila from '../services/lipila.service';
import { disburseRequisition, settleCardPayout } from '../controllers/disbursement.controller';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };

// ---- Lipila, stood in
const realFetch = globalThis.fetch;
type Post = 'pending' | 'successful' | 'refused403' | 'refused400' | 'server500';
let postMode: Post = 'pending';
let liveBalance = 1000;
const known: Record<string, 'Pending' | 'Successful' | 'Failed'> = {};
const sent: { reference: string; amount: number; account: string }[] = [];
globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(typeof input === 'string' ? input : input?.url ?? input);
    if (!/api\.lipila\.dev|blz\.lipila\.io/.test(url)) return realFetch(input, init);
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.includes('/merchants/balance')) return json(200, { success: true, data: { balance: liveBalance } });
    if (url.includes('/disbursements/mobile-money') && init.method === 'POST') {
        const b = JSON.parse(init.body);
        if (postMode === 'refused403') return json(403, { message: 'IP not whitelisted' });
        if (postMode === 'refused400') return json(400, { message: 'One or more errors occurred!' });
        if (postMode === 'server500') return json(500, {});
        sent.push({ reference: b.referenceId, amount: b.amount, account: b.accountNumber });
        known[b.referenceId] = postMode === 'successful' ? 'Successful' : 'Pending';
        return json(200, { referenceId: b.referenceId, status: known[b.referenceId], identifier: `LPLXC-${b.referenceId}` });
    }
    if (url.includes('/disbursements/check-status')) {
        const ref = new URL(url).searchParams.get('referenceId') ?? '';
        return known[ref] ? json(200, { referenceId: ref, status: known[ref], message: known[ref] === 'Failed' ? 'Insufficient funds at the network' : undefined }) : json(404, {});
    }
    return json(404, {});
}) as any;

const run = async (reqId: string, org: string, user: string, body: Record<string, unknown>) => {
    const res: any = { statusCode: 200, body: undefined as any, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
    const req: any = { params: { id: reqId }, body, user: { id: user, organization_id: org, role: 'ADMIN', name: 'ZZ Tester' }, get: () => undefined, protocol: 'https' };
    await disburseRequisition(req, res);
    return res as { statusCode: number; body: any };
};
const statusOf = async (id: string) => (await supabase.from('requisitions').select('status').eq('id', id).single()).data?.status as string;
const disbOf = async (id: string) => (await supabase.from('disbursements').select('*').eq('requisition_id', id).maybeSingle()).data as any;
const cardBalance = (org: string) => cashbookService.getCurrentBalance(org, lipila.CARD_ACCOUNT_TYPE);

(async () => {
    const tag = randomUUID().slice(0, 6);
    let org = ''; const reqIds: string[] = [];
    const { data: prev } = await supabase.from('app_settings').select('value, description').eq('key', 'lipila_rollout').maybeSingle();
    const { data: someone } = await supabase.from('users').select('id').limit(1).single();
    const user = someone!.id as string;
    try {
        const { data: o, error: oe } = await supabase.from('organizations').insert({ name: `ZZ TEST cardpay ${tag}`, slug: `zz-test-cardpay-${tag}`, payment_test_mode: false }).select('id').single();
        if (oe) throw oe; org = o!.id;
        await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: { all: false, orgs: [...(prev?.value?.orgs ?? []), org] }, description: prev?.description ?? 'Lipila card rollout', updated_at: new Date().toISOString() });
        lipila.clearRolloutCache();
        await lipila.saveCredentials(org, user, { apiKey: 'Lsk_pay_' + crypto.randomBytes(6).toString('hex'), env: 'sandbox', enabled: true }, null);
        await cashbookService.createEntry(org, { date: new Date().toISOString().split('T')[0], description: 'Card deposit | Ref: LPL-DEP-TEST', debit: 500, credit: 0, entry_type: 'INFLOW', account_type: lipila.CARD_ACCOUNT_TYPE, status: 'UNACCOUNTED', wallet_id: null, external_reference: `LPL-DEP-${tag}` } as any);
        check('the Card Wallet starts with the deposit', (await cardBalance(org)) === 500);

        const newReq = async (amount: number) => {
            const { data, error } = await supabase.from('requisitions').insert({ organization_id: org, requestor_id: user, description: `ZZ ${tag} payout ${amount}`, estimated_total: amount, status: 'AUTHORISED', type: 'EXPENSE' }).select('id').single();
            if (error) throw error; reqIds.push(data!.id); return data!.id as string;
        };
        const payBody = (amount: number, extra: Record<string, unknown> = {}) => ({ payment_method: 'MOBILE_MONEY', total_prepared: amount, recipient_account: '0971234567', recipient_bank_code: 'mtn', recipient_account_name: 'Test Person', wallet_id: 'CARD_WALLET', ...extra });

        check('Lipila’s charge follows the published table', lipila.payoutFee(100) === 5 && lipila.payoutFee(150) === 5 && lipila.payoutFee(151) === 7 && lipila.payoutFee(1000) === 21 && lipila.payoutFee(10001) === 100);
        check('numbers are checked before Lipila is called', lipila.isPayableNumber('0971234567') && lipila.isPayableNumber('+260971234567') && !lipila.isPayableNumber('12345') && !lipila.isPayableNumber('0971'));

        // ---- refusals send nothing
        const r1 = await newReq(100);
        let a = await run(r1, org, user, payBody(100, { recipient_bank_code: 'zanaco' }));
        check('a bank recipient is refused for the Card Wallet', a.statusCode === 400 && /mobile money/i.test(a.body?.error ?? '') && sent.length === 0 && (await statusOf(r1)) === 'AUTHORISED');
        a = await run(r1, org, user, payBody(100, { recipient_account: '0971' }));
        check('a bad number is refused before Lipila is called', a.statusCode === 400 && /mobile money number/i.test(a.body?.error ?? '') && sent.length === 0);
        liveBalance = 90; // the books say 500, Lipila says 90: the smaller one rules, and 100 + the 5 charge needs 105
        a = await run(r1, org, user, payBody(100));
        check('not enough in the wallet is refused, naming what is short', a.statusCode === 400 && /Insufficient Card Wallet balance/.test(a.body?.error ?? '') && sent.length === 0 && (await statusOf(r1)) === 'AUTHORISED', a.body?.error);
        liveBalance = 1000;

        // ---- a definite refusal leaves nothing behind
        postMode = 'refused403';
        a = await run(r1, org, user, payBody(100));
        check('Lipila refusing the key (403) fails cleanly', a.statusCode === 400 && /refused|Disbursal error/i.test(a.body?.error ?? ''), a.body?.error?.slice(0, 90));
        check('the requisition is back to Authorised with no payout record', (await statusOf(r1)) === 'AUTHORISED' && !(await disbOf(r1)) && (await cardBalance(org)) === 500);
        postMode = 'refused400';
        a = await run(r1, org, user, payBody(100));
        check('Lipila refusing the request (400) fails cleanly too', a.statusCode === 400 && (await statusOf(r1)) === 'AUTHORISED' && !(await disbOf(r1)));

        // ---- an unclear answer is never sent again
        postMode = 'server500';
        a = await run(r1, org, user, payBody(100));
        const d1 = await disbOf(r1);
        check('no answer from Lipila is not reported as failed', a.statusCode === 200 && a.body?.lencoStatus === 'pending', JSON.stringify(a.body)?.slice(0, 120));
        check('it waits as Processing, with a record Lipila can be asked about', (await statusOf(r1)) === 'PROCESSING' && !!d1 && d1.external_reference.startsWith(lipila.PAYOUT_REF_PREFIX) && Number(d1.total_prepared) === 105, JSON.stringify([d1?.external_reference, d1?.total_prepared]));
        check('nothing is booked on a guess', (await cardBalance(org)) === 500 && sent.length === 0);

        // ---- one unconfirmed payout blocks the next
        postMode = 'pending';
        const r2 = await newReq(60);
        a = await run(r2, org, user, payBody(60));
        check('while one payout is unconfirmed, a second is refused', a.statusCode === 409 && /still being confirmed/i.test(a.body?.error ?? '') && sent.length === 0 && (await statusOf(r2)) === 'AUTHORISED', a.body?.error?.slice(0, 80));

        // ---- Lipila says pending, then Successful
        const ref1 = d1.external_reference as string;
        let s = await settleCardPayout(ref1);
        check('Lipila having no record yet changes nothing', s.state === 'pending' && (await statusOf(r1)) === 'PROCESSING' && (await cardBalance(org)) === 500);
        known[ref1] = 'Pending';
        s = await settleCardPayout(ref1);
        check('Lipila saying Pending changes nothing', s.state === 'pending' && (await cardBalance(org)) === 500);
        known[ref1] = 'Successful';
        s = await settleCardPayout(ref1);
        check('Lipila saying Successful moves it to Received', s.state === 'successful' && (await statusOf(r1)) === 'RECEIVED');
        check('the Card Wallet is debited the amount plus the charge, once', (await cardBalance(org)) === 395, `balance ${await cardBalance(org)}`);
        await settleCardPayout(ref1); await settleCardPayout(ref1);
        check('asking again never books it twice', (await cardBalance(org)) === 395);
        const { data: ents } = await supabase.from('cashbook_entries').select('account_type, credit').eq('requisition_id', r1).eq('entry_type', 'DISBURSEMENT');
        check('it is on the Card Wallet account, not a MoneyWise wallet', (ents ?? []).length === 1 && ents![0].account_type === lipila.CARD_ACCOUNT_TYPE && Number(ents![0].credit) === 105);
        const { data: fee } = await supabase.from('line_items').select('estimated_amount').eq('requisition_id', r1).ilike('description', '%Withdrawal Fee%');
        check('Lipila’s charge is booked once as a transaction charge', (fee ?? []).length === 1 && Number(fee![0].estimated_amount) === 5);

        // ---- a double click is stopped
        const r3 = await newReq(100);
        a = await run(r3, org, user, payBody(100));
        check('the same amount again within two minutes is stopped', a.statusCode === 409 && /just sent/i.test(a.body?.error ?? '') && (await statusOf(r3)) === 'AUTHORISED', a.body?.error?.slice(0, 80));

        // ---- a payout Lipila fails is reversed, and a retry gets a new reference
        const r4 = await newReq(60);
        postMode = 'pending';
        a = await run(r4, org, user, payBody(60));
        const d4 = await disbOf(r4);
        check('a payout Lipila accepts waits as Processing', a.statusCode === 200 && (await statusOf(r4)) === 'PROCESSING' && sent.length === 1 && sent[0].account === '260971234567' && sent[0].amount === 60, JSON.stringify(sent));
        known[d4.external_reference] = 'Failed';
        s = await settleCardPayout(d4.external_reference);
        check('Lipila saying Failed reverses it', s.state === 'failed' && (await statusOf(r4)) === 'AUTHORISED' && !(await disbOf(r4)));
        check('a failed payout books nothing', (await cardBalance(org)) === 395);
        a = await run(r4, org, user, payBody(60));
        check('the retry is sent under a new reference, never the old one', a.statusCode === 200 && sent.length === 2 && sent[1].reference === `${d4.external_reference}-R1`, sent[1]?.reference);
        const reqWithDisb = await disbOf(r4);
        check('the retry has its own payout record', !!reqWithDisb && reqWithDisb.external_reference === `${d4.external_reference}-R1` && (await statusOf(r4)) === 'PROCESSING', JSON.stringify({ status: await statusOf(r4), body: a.body, rec: reqWithDisb?.external_reference }));
        if (!reqWithDisb) throw new Error('no record after the retry');
        known[reqWithDisb.external_reference] = 'Successful';
        await settleCardPayout(reqWithDisb.external_reference);
        check('the retry settles and the wallet is debited 60 + 7', (await statusOf(r4)) === 'RECEIVED' && (await cardBalance(org)) === 395 - 67, `balance ${await cardBalance(org)}`);
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        globalThis.fetch = realFetch;
        if (prev) await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: prev.value, description: prev.description, updated_at: new Date().toISOString() });
        else await supabase.from('app_settings').delete().eq('key', 'lipila_rollout');
        lipila.clearRolloutCache();
        if (org) {
            await new Promise((r) => setTimeout(r, 2000));
            if (reqIds.length) {
                await supabase.from('requisition_messages').delete().in('requisition_id', reqIds);
                await supabase.from('disbursements').delete().in('requisition_id', reqIds);
                await supabase.from('line_items').delete().in('requisition_id', reqIds);
            }
            await supabase.from('audit_logs').delete().in('entity_id', reqIds.length ? reqIds : ['00000000-0000-0000-0000-000000000000']);
            await supabase.from('org_gateway_credentials').delete().eq('organization_id', org);
            const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', org); const jids = (je ?? []).map((j: any) => j.id);
            if (jids.length) await supabase.from('journal_lines').delete().in('journal_entry_id', jids);
            await supabase.from('journal_entries').delete().eq('organization_id', org);
            await supabase.from('cashbook_entries').delete().eq('organization_id', org);
            if (reqIds.length) await supabase.from('requisitions').delete().in('id', reqIds);
            await supabase.from('accounts').delete().eq('organization_id', org);
            await supabase.from('organizations').delete().eq('id', org);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST cardpay ${tag}`);
            console.log(`cleanup: ${count ?? 0} test businesses left`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();

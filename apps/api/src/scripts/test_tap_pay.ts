/**
 * Tap to pay: the receiver's setting, who may open a request, the one-time claim, and how a payment is linked.
 * Uses three existing people (their setting is put back at the end) and throwaway business, requests and payments.
 * Run: npx tsx src/scripts/test_tap_pay.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import * as tap from '../services/tapPay.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const code = async (p: Promise<any>): Promise<string> => { try { await p; return 'OK'; } catch (e: any) { return e?.code ?? e?.message ?? 'ERR'; } };

(async () => {
    const tag = randomUUID().slice(0, 6);
    let org = ''; const reqIds: string[] = []; const disbIds: string[] = [];
    const { data: people } = await supabase.from('users').select('id, tap_receive').limit(3);
    if (!people || people.length < 3) throw new Error('need three existing users');
    const [A, B, C] = people.map((p: any) => p.id as string);
    const before = people.map((p: any) => ({ id: p.id, mode: p.tap_receive }));
    try {
        const { data: o, error } = await supabase.from('organizations').insert({ name: `ZZ TEST tap ${tag}`, slug: `zz-test-tap-${tag}` }).select('id').single();
        if (error) throw error; org = o!.id;

        // ---- the setting
        await tap.setMode(A, 'OFF'); await tap.setMode(B, 'OFF'); await tap.setMode(C, 'OFF');
        check('the setting starts Off', (await tap.getMode(A)) === 'OFF');
        check('a bad setting is refused', (await code(tap.setMode(A, 'ALL'))) === 'MODE');
        check('a receiver with the setting Off cannot make a request', (await code(tap.createRequest({ userId: A, orgId: org, amount: 50 }))) === 'OFF');

        // ---- everyone
        await tap.setMode(A, 'EVERYONE');
        const r1 = await tap.createRequest({ userId: A, orgId: org, amount: 50, note: 'Lunch' });
        check('a request gets a code and a link', /^[A-Z2-9]{10}$/.test(r1.code) && r1.url.endsWith(`/r/${r1.code}`));
        check('a tap request lasts about two minutes', Math.abs(Date.parse(r1.expiresAt) - Date.now() - 120_000) < 5_000);
        const seen = await tap.resolve(r1.code, B);
        check('another person sees who is asking and for how much', seen.amount === 50 && seen.note === 'Lunch' && seen.recipient.user_id === A);
        check('your own request is refused with a clear reason', (await code(tap.resolve(r1.code, A))) === 'OWN');
        check('a wrong code looks like any other unavailable request', (await code(tap.resolve('ZZZZZZZZZZ', B))) === 'NOT_AVAILABLE');
        check('bad amounts are refused', (await code(tap.createRequest({ userId: A, orgId: org, amount: -5 }))) === 'AMOUNT' && (await code(tap.createRequest({ userId: A, orgId: org, amount: 9e9 }))) === 'AMOUNT');
        const r1b = await tap.createRequest({ userId: A, orgId: org, amount: 60 });
        check('a new tap request replaces the old one', (await code(tap.resolve(r1.code, B))) === 'EXPIRED' && (await tap.resolve(r1b.code, B)).amount === 60);

        // ---- my contacts
        await tap.setMode(A, 'CONTACTS');
        check('"My contacts" hides a request from someone not yet sent to', (await code(tap.resolve(r1b.code, B))) === 'NOT_AVAILABLE');
        const { data: rq } = await supabase.from('requisitions').insert({ organization_id: org, requestor_id: A, description: `ZZ ${tag} earlier`, estimated_total: 5, status: 'COMPLETED', type: 'EXPENSE' }).select('id').single();
        reqIds.push(rq!.id);
        const { data: dis, error: de } = await supabase.from('disbursements').insert({ requisition_id: rq!.id, payment_method: 'MONEYWISE_PAY', recipient_account: B, recipient_bank_code: 'moneywise', total_prepared: 5, cashier_id: A }).select('id').single();
        if (de) throw de; disbIds.push(dis!.id);
        check('...but shows it to someone the receiver has sent money to before', (await tap.resolve(r1b.code, B)).amount === 60);
        check('...and still hides it from everyone else', (await code(tap.resolve(r1b.code, C))) === 'NOT_AVAILABLE');

        // ---- claiming and paying
        check('only the account holder can pay by tap', (await code(tap.claim(r1b.code, { id: B, role: 'REQUESTOR' }))) === 'ROLE');
        const claimed = await tap.claim(r1b.code, { id: B, role: 'ADMIN' });
        check('a payer can reserve the request', !!claimed.claimExpiresAt);
        await tap.setMode(A, 'EVERYONE');
        check('a second person cannot take a reserved request', (await code(tap.resolve(r1b.code, C))) === 'IN_USE');
        check('the same payer can reserve again', !!(await tap.claim(r1b.code, { id: B, role: 'ADMIN' })).claimExpiresAt);

        const { data: pay1 } = await supabase.from('requisitions').insert({ organization_id: org, requestor_id: B, description: `ZZ ${tag} wrong`, estimated_total: 10, status: 'AUTHORISED', type: 'EXPENSE' }).select('id').single();
        const { data: pay2 } = await supabase.from('requisitions').insert({ organization_id: org, requestor_id: B, description: `ZZ ${tag} right`, estimated_total: 60, status: 'AUTHORISED', type: 'EXPENSE' }).select('id').single();
        const { data: pay3 } = await supabase.from('requisitions').insert({ organization_id: org, requestor_id: C, description: `ZZ ${tag} not yours`, estimated_total: 60, status: 'AUTHORISED', type: 'EXPENSE' }).select('id').single();
        reqIds.push(pay1!.id, pay2!.id, pay3!.id);
        check('a payment for a different amount is refused', (await code(tap.attach(r1b.code, B, pay1!.id))) === 'AMOUNT');
        check('someone else’s payment cannot be linked', (await code(tap.attach(r1b.code, B, pay3!.id))) === 'REQUISITION');
        check('a person who has not reserved it cannot link a payment', (await code(tap.attach(r1b.code, C, pay2!.id))) === 'CLAIM');
        check('the right payment is linked', (await tap.attach(r1b.code, B, pay2!.id)).ok === true);

        const st1 = await tap.status(r1b.id, A);
        check('while the money has not moved the receiver sees it as in progress', st1.status === 'CLAIMED' && st1.claimed);
        await supabase.from('requisitions').update({ status: 'DISBURSED' }).eq('id', pay2!.id);
        const st2 = await tap.status(r1b.id, A);
        check('once the payment is made the receiver sees it paid, and by whom', st2.status === 'PAID' && st2.paidAmount === 60 && !!st2.payer, JSON.stringify([st2.status, st2.paidAmount, st2.payer]));
        check('a paid request cannot be paid again', (await code(tap.resolve(r1b.code, B))) === 'PAID');
        check('only the receiver can read a request’s status', (await code(tap.status(r1b.id, B))) === 'NOT_AVAILABLE');

        // ---- ending, expiry and switching off
        const r2 = await tap.createRequest({ userId: A, orgId: org, kind: 'LINK' });
        check('a link request lasts a day and can have no amount', r2.amount === null && Math.abs(Date.parse(r2.expiresAt) - Date.now() - 86_400_000) < 5_000);
        check('the receiver can cancel an open request', (await tap.cancel(r2.id, A)).cancelled === true && (await code(tap.resolve(r2.code, B))) === 'EXPIRED');
        const r3 = await tap.createRequest({ userId: A, orgId: org, amount: 5, kind: 'LINK' });
        await supabase.from('pay_requests').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', r3.id);
        check('an old request has expired', (await code(tap.resolve(r3.code, B))) === 'EXPIRED');
        const r4 = await tap.createRequest({ userId: A, orgId: org, amount: 7, kind: 'LINK' });
        await tap.setMode(A, 'OFF');
        check('turning the setting Off ends open requests', (await code(tap.resolve(r4.code, B))) === 'NOT_AVAILABLE');
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        for (const p of before) await supabase.from('users').update({ tap_receive: p.mode ?? 'OFF' }).eq('id', p.id);
        if (disbIds.length) await supabase.from('disbursements').delete().in('id', disbIds);
        await supabase.from('pay_requests').delete().in('receiver_user_id', [A, B, C].filter(Boolean)).like('code', '%');
        if (reqIds.length) { await supabase.from('line_items').delete().in('requisition_id', reqIds); await supabase.from('requisitions').delete().in('id', reqIds); }
        if (org) { await supabase.from('requisitions').delete().eq('organization_id', org); await supabase.from('organizations').delete().eq('id', org); }
        const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST tap ${tag}`);
        console.log(`cleanup: ${count ?? 0} test businesses left`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();

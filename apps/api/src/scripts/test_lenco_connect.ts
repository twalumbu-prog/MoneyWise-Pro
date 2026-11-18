/**
 * Connecting a business to its own Lenco wallet with its keys (the Master Fees way). Lenco is stood in; the database is live, with two
 * throwaway businesses removed at the end. Run: npx tsx src/scripts/test_lenco_connect.ts
 */
import axios from 'axios';
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import { connectWithKeys, checkConnection, ConnectError } from '../services/lencoKeysConnect.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const code = async (p: Promise<any>): Promise<string> => { try { await p; return 'OK'; } catch (e: any) { return e instanceof ConnectError ? e.code : `ERR:${e?.message}`; } };

// ---- Lenco, stood in
let accounts: any[] = [];
let keyOk = true;
const realGet = axios.get;
(axios as any).get = async (url: string) => {
    const fail = (status: number) => { const e: any = new Error(`status ${status}`); e.response = { status, data: { message: 'x' } }; throw e; };
    if (!keyOk) fail(401);
    if (/\/accounts$/.test(url)) return { data: { data: accounts } };
    const m = url.match(/\/accounts\/([^/]+)(\/balance)?$/);
    if (m) { const a = accounts.find((x) => x.id === m[1]); if (!a) fail(404); return { data: { data: m[2] ? { availableBalance: a.availableBalance, currency: 'ZMW' } : a } }; }
    fail(404);
};

(async () => {
    const tag = randomUUID().slice(0, 6);
    const A = randomUUID(), B = randomUUID(), C = randomUUID();
    const orgs: string[] = [];
    try {
        const mk = async (n: string) => { const { data, error } = await supabase.from('organizations').insert({ name: `ZZ TEST lencoconn ${n} ${tag}`, slug: `zz-test-lencoconn-${n}-${tag}` }).select('id').single(); if (error) throw error; orgs.push(data!.id); return data!.id as string; };
        const one = await mk('one'), two = await mk('two');
        const secret = 'sk_live_' + 'x'.repeat(20);

        check('a missing public key is refused', (await code(connectWithKeys({ orgId: one, publicKey: '', secretKey: secret }))) === 'NO_PUBLIC');
        check('a secret pasted as the public key is caught', (await code(connectWithKeys({ orgId: one, publicKey: secret, secretKey: secret }))) === 'BAD_PUBLIC');
        check('a public key pasted as the secret is caught', (await code(connectWithKeys({ orgId: one, publicKey: 'pub-abc', secretKey: 'pub-' + 'y'.repeat(20) }))) === 'BAD_SECRET');
        check('an Account ID that isn’t one is refused', (await code(connectWithKeys({ orgId: one, publicKey: 'pub-abc', secretKey: secret, accountId: 'not-an-id' }))) === 'BAD_ACCOUNT_ID');

        keyOk = false;
        check('a key Lenco refuses is reported as that', (await code(connectWithKeys({ orgId: one, publicKey: 'pub-abc', secretKey: secret }))) === 'BAD_KEY');
        keyOk = true;

        accounts = [];
        let e1: any; try { await connectWithKeys({ orgId: one, publicKey: 'pub-abc', secretKey: secret }); } catch (e) { e1 = e; }
        check('a key that sees no account asks for the Account ID', e1?.code === 'NEEDS_ACCOUNT_ID' && e1?.extra?.needsAccountId === true);

        accounts = [{ id: A, name: 'School Wallet', availableBalance: '120.50', currency: 'ZMW' }, { id: B, name: 'Other', availableBalance: '5', currency: 'ZMW' }];
        let e2: any; try { await connectWithKeys({ orgId: one, publicKey: 'pub-abc', secretKey: secret }); } catch (e) { e2 = e; }
        check('several accounts: it asks which, and lists them', e2?.code === 'NEEDS_ACCOUNT_ID' && (e2?.extra?.accounts ?? []).length === 2 && e2.extra.accounts[0].name === 'School Wallet');
        const { data: untouched } = await supabase.from('organizations').select('lenco_subaccount_id, lenco_secret_key').eq('id', one).single();
        check('nothing is saved until an account is chosen', !untouched?.lenco_subaccount_id && !untouched?.lenco_secret_key);

        check('an Account ID this key can’t see is refused', (await code(connectWithKeys({ orgId: one, publicKey: 'pub-abc', secretKey: secret, accountId: C }))) === 'NO_ACCOUNT');

        const r = await connectWithKeys({ orgId: one, publicKey: 'pub-abc', secretKey: secret, accountId: A });
        check('choosing an account connects it and reads the live balance', r.connected && r.accountId === A && r.balance === 120.5 && /120\.50/.test(r.message), r.message);
        const { data: saved } = await supabase.from('organizations').select('lenco_public_key, lenco_secret_key, lenco_subaccount_id').eq('id', one).single();
        check('the keys and the account are saved on the business', saved?.lenco_public_key === 'pub-abc' && saved?.lenco_secret_key === secret && saved?.lenco_subaccount_id === A);

        const c = await checkConnection(one);
        check('Check reads the live balance of the saved link', c.balance === 120.5 && c.accountId === A);
        accounts = [{ id: A, name: 'School Wallet', availableBalance: '99.00', currency: 'ZMW' }];
        check('Check follows Lenco’s latest figure', (await checkConnection(one)).balance === 99);

        check('connecting the same account again is fine', (await code(connectWithKeys({ orgId: one, publicKey: 'pub-abc', secretKey: secret, accountId: A }))) === 'OK');
        accounts = [{ id: A, name: 'School Wallet', availableBalance: '1', currency: 'ZMW' }, { id: B, name: 'Other', availableBalance: '1', currency: 'ZMW' }];
        check('a linked business can’t switch to another account', (await code(connectWithKeys({ orgId: one, publicKey: 'pub-abc', secretKey: secret, accountId: B }))) === 'ALREADY_LINKED');
        check('an account already used by another business is refused', (await code(connectWithKeys({ orgId: two, publicKey: 'pub-zzz', secretKey: 'sk_live_' + 'z'.repeat(20), accountId: A }))) === 'IN_USE');
        check('a secret key already used by another business is refused', (await code(connectWithKeys({ orgId: two, publicKey: 'pub-abc', secretKey: secret, accountId: B }))) === 'KEY_IN_USE');
        check('Check before connecting says what is missing', (await code(checkConnection(two))) === 'NOT_CONNECTED');

        accounts = [{ id: B, name: 'Only One', availableBalance: '7', currency: 'ZMW' }];
        const solo = await connectWithKeys({ orgId: two, publicKey: 'pub-www', secretKey: 'sk_live_' + 'w'.repeat(20) });
        check('a key with one account connects it without asking', solo.accountId === B && solo.accountName === 'Only One');
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        (axios as any).get = realGet;
        if (orgs.length) await supabase.from('organizations').delete().in('id', orgs);
        const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST lencoconn % ${tag}`);
        console.log(`cleanup: ${count ?? 0} test businesses left`);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();

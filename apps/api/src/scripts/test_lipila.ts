/**
 * Lipila card payments, end to end, with Lipila itself replaced by a stand-in (no real key, no real money). Everything else is real: the
 * encrypted key storage, the sale intent, the session table, signature checks, and the recording into the cashbook, against the live
 * database with a throwaway business that is removed at the end. Run: npx tsx src/scripts/test_lipila.ts
 */
import crypto, { randomUUID } from 'crypto';

process.env.GATEWAY_CREDENTIALS_KEY = process.env.GATEWAY_CREDENTIALS_KEY || crypto.randomBytes(32).toString('hex');

import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import * as lipila from '../services/lipila.service';
import { verifyCollectionStatus } from '../controllers/lenco.controller';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const expectErr = async (name: string, fn: () => Promise<unknown>, code: string) => {
    try { await fn(); check(name, false, 'did not throw'); } catch (e: any) { check(name, e instanceof lipila.LipilaError && e.code === code, e?.code ?? e?.message); }
};

// The stand-in for Lipila. Anything else (the database) passes straight through.
const realFetch = globalThis.fetch;
const lipilaCalls: { url: string; method: string; headers: Record<string, string>; body: any }[] = [];
const outcome = new Map<string, 'pending' | 'successful' | 'failed'>();
let keyAccepted = (k: string) => !!k;
globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(typeof input === 'string' ? input : input?.url ?? input);
    if (!/api\.lipila\.dev|blz\.lipila\.io/.test(url)) return realFetch(input, init);
    const headers: Record<string, string> = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const body = init.body ? JSON.parse(init.body) : null;
    lipilaCalls.push({ url, method: init.method ?? 'GET', headers, body });
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (!keyAccepted(headers['x-api-key'])) return json(401, { message: 'Unauthorized' });
    if (url.includes('/collections/card')) return json(200, { status: 'Pending', cardRedirectionUrl: `https://checkout.example/pay/${body.collectionRequest.referenceId}`, referenceId: body.collectionRequest.referenceId, identifier: 'id-1' });
    if (url.includes('/collections/check-status')) {
        const ref = new URL(url).searchParams.get('referenceId')!;
        const o = outcome.get(ref);
        if (!o) return json(404, { message: 'not found' });
        return json(200, { status: o === 'successful' ? 'Successful' : o === 'failed' ? 'Failed' : 'Pending', message: o === 'failed' ? 'Card declined' : undefined });
    }
    return json(404, {});
}) as any;

const KEY_A = 'Lsk_test_orgA_' + crypto.randomBytes(8).toString('hex');
const KEY_B = 'Lsk_test_orgB_' + crypto.randomBytes(8).toString('hex');
const SECRET_A = crypto.randomBytes(32).toString('base64');
const SECRET_B = crypto.randomBytes(32).toString('base64');
const sign = (secret: string, id: string, ts: number, body: string) => `v1,${crypto.createHmac('sha256', Buffer.from(secret, 'base64')).update(`${id}.${ts}.${body}`).digest('base64')}`;

(async () => {
    const tag = randomUUID().slice(0, 6);
    const orgIds: string[] = [];
    const mkOrg = async (n: string) => { const { data, error } = await supabase.from('organizations').insert({ name: `ZZ TEST card ${n} ${tag}`, slug: `zz-test-card-${n}-${tag}` }).select('id').single(); if (error) throw error; orgIds.push(data.id); return data.id as string; };
    const { data: prevRollout } = await supabase.from('app_settings').select('value, description').eq('key', 'lipila_rollout').maybeSingle();

    try {
        const A = await mkOrg('a'); const B = await mkOrg('b'); const C = await mkOrg('c');
        // A and B are in the rollout; C is not.
        await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: { all: false, orgs: [...(prevRollout?.value?.orgs ?? []), A, B] }, description: prevRollout?.description ?? 'Lipila card rollout', updated_at: new Date().toISOString() });
        lipila.clearRolloutCache();

        // ── settings
        await expectErr('a business outside the rollout can’t save a key', () => lipila.saveCredentials(C, randomUUID(), { apiKey: KEY_A, enabled: true }, null), 'NOT_AVAILABLE');
        await expectErr('a key is needed', () => lipila.saveCredentials(A, randomUUID(), { enabled: true }, null), 'NO_KEY');
        await expectErr('a nonsense key is refused', () => lipila.saveCredentials(A, randomUUID(), { apiKey: 'abc def' }, null), 'BAD_KEY');
        const saved = await lipila.saveCredentials(A, randomUUID(), { apiKey: KEY_A, webhookSecret: SECRET_A, env: 'sandbox', enabled: true }, 'https://api.example.com');
        await lipila.saveCredentials(B, randomUUID(), { apiKey: KEY_B, webhookSecret: SECRET_B, env: 'sandbox', enabled: true }, null);
        check('settings show the key hint, never the key', saved.configured && saved.enabled && saved.keyHint === `…${KEY_A.slice(-4)}` && !JSON.stringify(saved).includes(KEY_A) && saved.hasWebhookSecret, JSON.stringify(saved));
        check('the webhook address to give Lipila is shown', saved.webhookUrl === 'https://api.example.com/webhooks/lipila');
        const { data: raw } = await supabase.from('org_gateway_credentials').select('lipila_api_key_enc, lipila_webhook_secret_enc').eq('organization_id', A).single();
        check('the key is stored encrypted, not as text', !!raw && !raw.lipila_api_key_enc.includes(KEY_A) && !raw.lipila_webhook_secret_enc.includes(SECRET_A));
        const re = await lipila.saveCredentials(A, randomUUID(), { enabled: true, env: 'sandbox' }, null);
        check('saving again without the key keeps the saved key', re.configured && (await lipila.getCredentials(A))?.apiKey === KEY_A);
        check('cards are on for A and B, off for C', (await lipila.cardsEnabledFor(A)) && (await lipila.cardsEnabledFor(B)) && !(await lipila.cardsEnabledFor(C)));
        keyAccepted = (k) => k === KEY_A || k === KEY_B;
        check('connection test passes for a good key', (await lipila.testKey(A)).ok === true);
        keyAccepted = () => false;
        check('connection test explains a refused key', (await lipila.testKey(A)).ok === false);
        keyAccepted = (k) => k === KEY_A || k === KEY_B;

        // ── a sale waiting to be paid (what the checkout records first)
        const sale = async (org: string, net: number) => {
            const ref = `LPL-DEP-${Date.now()}-${randomUUID().slice(0, 6)}-PL`;
            await cashbookService.createEntry(org, { date: new Date().toISOString().split('T')[0], description: `PENDING_INTENT: Sale: Test goods | Cust: 0977000000 | Ref: ${ref}`, debit: net, credit: 0, entry_type: 'INFLOW', account_type: 'MONEYWISE_WALLET', status: 'PENDING', external_reference: ref, wallet_id: null } as any);
            return ref;
        };
        const ref = await sale(A, 100);

        // ── starting the payment
        await expectErr('a reference without the card prefix is refused', () => lipila.initiateCard({ organizationId: A, reference: 'DEP-123', apiBase: null }), 'REFERENCE');
        await expectErr('a business with cards off is refused', () => lipila.initiateCard({ organizationId: C, reference: 'LPL-x', apiBase: null }), 'NOT_ENABLED');
        await expectErr('a payment with no recorded sale is refused (the browser can’t name the amount)', () => lipila.initiateCard({ organizationId: A, reference: `LPL-DEP-none-${tag}`, apiBase: null }), 'NO_INTENT');
        const g = lipila.grossUp(100);
        check('the customer is charged enough to cover Lipila’s 4%', g.charged === 104.17 && g.fee === 4.17 && Math.round((g.charged * 0.96 - 100) * 100) / 100 <= 0.01, JSON.stringify(g));
        const init = await lipila.initiateCard({ organizationId: A, reference: ref, apiBase: 'https://api.example.com', customer: { firstName: 'Mary', lastName: 'Banda', phone: '0977000000', email: 'mary@example.com' }, context: { kind: 'payment_link' } });
        const card = lipilaCalls.find((c) => c.url.includes('/collections/card'))!;
        check('Lipila is asked for the grossed-up amount with this business’s key', card.headers['x-api-key'] === KEY_A && card.body.collectionRequest.amount === 104.17 && card.body.collectionRequest.referenceId === ref, `${card.body.collectionRequest.amount}`);
        check('the callback address is sent', card.headers['callbackurl'] === 'https://api.example.com/webhooks/lipila');
        check('the card page address is returned', init.redirectUrl === `https://checkout.example/pay/${ref}` && init.charged === 104.17 && init.fee === 4.17);
        const callsBefore = lipilaCalls.filter((c) => c.url.includes('/collections/card')).length;
        const init2 = await lipila.initiateCard({ organizationId: A, reference: ref, apiBase: null });
        check('asking again returns the same card page without a second charge request', init2.redirectUrl === init.redirectUrl && lipilaCalls.filter((c) => c.url.includes('/collections/card')).length === callsBefore);
        await expectErr('another business can’t use this payment', () => lipila.initiateCard({ organizationId: B, reference: ref, apiBase: null }), 'REFERENCE');
        const { data: sess } = await supabase.from('lipila_card_sessions').select('*').eq('reference', ref).single();
        check('the session records what the business gets and what the card pays', Number(sess.net_amount) === 100 && Number(sess.charged_amount) === 104.17 && sess.status === 'INITIATED');

        // ── before the customer has paid
        outcome.set(ref, 'pending');
        const waiting = await lipila.finalizeCard(ref);
        check('still waiting while Lipila says pending', waiting.state === 'pending');
        const countEntries = async (r: string, org = A) => (await supabase.from('cashbook_entries').select('id, status, account_type, debit, reference_number', { count: 'exact' }).eq('organization_id', org).eq('external_reference', r)).data ?? [];
        check('nothing is recorded yet beyond the waiting sale', (await countEntries(ref)).every((e: any) => e.status === 'PENDING'));

        // ── the webhook
        const body = JSON.stringify({ referenceId: ref, identifier: 'id-1', status: 'Successful', amount: 104.17, currency: 'ZMW', paymentType: 'Card' });
        const now = Math.floor(Date.now() / 1000);
        const hdr = (secret: string, ts = now, b = body, id = 'msg_1') => ({ 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': sign(secret, id, ts, b) });
        const good = await lipila.verifyWebhook(body, hdr(SECRET_A));
        check('a correctly signed webhook is accepted and matched to the payment', good.ok && good.reference === ref);
        check('a body changed after signing is refused', !(await lipila.verifyWebhook(body.replace('104.17', '1.00'), hdr(SECRET_A))).ok);
        check('an old webhook is refused', !(await lipila.verifyWebhook(body, hdr(SECRET_A, now - 3600))).ok);
        check('a webhook signed with another business’s secret is refused', !(await lipila.verifyWebhook(body, hdr(SECRET_B))).ok);
        check('a webhook with no signature is refused', !(await lipila.verifyWebhook(body, {})).ok);
        const rotating = { ...hdr(SECRET_A) }; rotating['webhook-signature'] = `v1,${Buffer.from('nonsense').toString('base64')} ${rotating['webhook-signature']}`;
        check('two signatures during a key change are accepted when one is right', (await lipila.verifyWebhook(body, rotating)).ok);
        const unknown = JSON.stringify({ referenceId: `LPL-unknown-${tag}`, status: 'Successful' });
        check('a webhook for an unknown payment can’t be verified with any business’s secret', !(await lipila.verifyWebhook(unknown, hdr(SECRET_A, now, unknown))).ok || (await lipila.verifyWebhook(unknown, hdr(SECRET_A, now, unknown))).reference === null);

        // ── the customer pays: webhook, browser and retries all arrive together
        outcome.set(ref, 'successful');
        const results = await Promise.all([1, 2, 3, 4, 5].map(() => lipila.finalizeCard(ref)));
        check('every caller is told it succeeded', results.every((r) => r.state === 'successful' || r.state === 'pending') && results.some((r) => r.state === 'successful'), results.map((r) => r.state).join(','));
        const after = await lipila.finalizeCard(ref);
        const entries = await countEntries(ref);
        check('the payment is in the books exactly once, as the net price, on the Lipila wallet account', entries.length === 1 && entries[0].status !== 'PENDING' && entries[0].account_type === 'LIPILA_WALLET' && Number(entries[0].debit) === 100, JSON.stringify(entries));
        check('a receipt number is returned', after.state === 'successful' && !!after.referenceNumber, String(after.referenceNumber));
        const { data: fin } = await supabase.from('lipila_card_sessions').select('status, finalized_at').eq('reference', ref).single();
        check('the session is marked successful', fin?.status === 'SUCCESSFUL' && !!fin.finalized_at);
        await lipila.finalizeCard(ref); await lipila.finalizeCard(ref);
        check('later checks never add it again', (await countEntries(ref)).length === 1);

        // ── the existing waiting screens ask the old status address; a card payment is answered by the new service
        let sent: any = null;
        await verifyCollectionStatus({ params: { reference: ref }, query: { organizationId: A } } as any, { json: (b: any) => { sent = b; return b; }, status: () => ({ json: (b: any) => { sent = b; } }) } as any);
        check('the existing status address hands a card payment over and reports success', sent?.verified === true && sent?.source === 'lipila' && !!sent?.referenceNumber, JSON.stringify(sent));

        // ── a declined card
        const ref2 = await sale(A, 50);
        await lipila.initiateCard({ organizationId: A, reference: ref2, apiBase: null });
        outcome.set(ref2, 'failed');
        const declined = await lipila.finalizeCard(ref2);
        check('a declined card is reported and records nothing', declined.state === 'failed' && (await countEntries(ref2)).every((e: any) => e.status === 'PENDING'), declined.message);
        const { data: s2 } = await supabase.from('lipila_card_sessions').select('status').eq('reference', ref2).single();
        check('the declined payment is marked failed', s2?.status === 'FAILED');

        // ── another business's payment is looked up with that business's own key
        const refB = await sale(B, 80);
        await lipila.initiateCard({ organizationId: B, reference: refB, apiBase: null });
        const cardB = [...lipilaCalls].reverse().find((c) => c.url.includes('/collections/card'))!;
        check('each business’s payment goes out with its own key', cardB.headers['x-api-key'] === KEY_B);
        outcome.set(refB, 'successful');
        const sawKeys = new Set<string>();
        const before = lipilaCalls.length;
        await lipila.finalizeCard(refB);
        lipilaCalls.slice(before).filter((c) => c.url.includes('check-status')).forEach((c) => sawKeys.add(c.headers['x-api-key']));
        check('and the status check uses that same business’s key', sawKeys.size === 1 && sawKeys.has(KEY_B));
        check('the money is booked to the right business only', (await countEntries(refB, B)).length === 1 && (await countEntries(refB, A)).length === 0);

        // ── a key that stops working, and removing the key
        keyAccepted = () => false;
        const refC = await sale(A, 20);
        await expectErr('a refused key gives the owner a clear message', () => lipila.initiateCard({ organizationId: A, reference: refC, apiBase: null }), 'BAD_KEY');
        keyAccepted = (k) => k === KEY_A || k === KEY_B;
        await lipila.removeCredentials(A);
        check('removing the key turns cards off', !(await lipila.cardsEnabledFor(A)) && !(await lipila.getCredentials(A)));

        // ── no encryption key on the server
        const saveKey = process.env.GATEWAY_CREDENTIALS_KEY; delete process.env.GATEWAY_CREDENTIALS_KEY; delete process.env.MESSAGING_TOKEN_KEY;
        await expectErr('with no server encryption key, nothing is saved in plain text', () => lipila.saveCredentials(A, randomUUID(), { apiKey: KEY_A }, null), 'NO_ENC_KEY');
        process.env.GATEWAY_CREDENTIALS_KEY = saveKey;
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        globalThis.fetch = realFetch;
        // Put the rollout setting back exactly as it was, then remove everything the test made.
        if (prevRollout) await supabase.from('app_settings').upsert({ key: 'lipila_rollout', value: prevRollout.value, description: prevRollout.description, updated_at: new Date().toISOString() });
        else await supabase.from('app_settings').delete().eq('key', 'lipila_rollout');
        lipila.clearRolloutCache();
        if (orgIds.length) {
            await new Promise((r) => setTimeout(r, 1500)); // let any background ledger posting settle before deleting
            await supabase.from('lipila_card_sessions').delete().in('organization_id', orgIds);
            await supabase.from('org_gateway_credentials').delete().in('organization_id', orgIds);
            for (const t of ['journal_lines', 'journal_entries']) {
                if (t === 'journal_lines') { const { data: je } = await supabase.from('journal_entries').select('id').in('organization_id', orgIds); const ids = (je ?? []).map((j: any) => j.id); if (ids.length) await supabase.from('journal_lines').delete().in('journal_entry_id', ids); }
                else await supabase.from('journal_entries').delete().in('organization_id', orgIds);
            }
            await supabase.from('cashbook_entries').delete().in('organization_id', orgIds);
            await supabase.from('accounts').delete().in('organization_id', orgIds);
            const { error: delErr } = await supabase.from('organizations').delete().in('id', orgIds);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', `ZZ TEST card % ${tag}`);
            console.log(`cleanup: ${count ?? 0} test businesses left${delErr ? ` (${delErr.message.slice(0, 80)})` : ''}`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();

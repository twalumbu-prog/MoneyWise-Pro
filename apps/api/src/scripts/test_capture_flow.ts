/**
 * End-to-end capture checks against a real database: I2-I6, I8, L1, L3, S1-S3, plus idempotency, deferral and the AI
 * budget. Creates two throwaway organizations and removes them afterwards.
 *
 * STAGING ONLY. It refuses to run without CAPTURE_TEST_ALLOW=1, and always refuses the production project.
 *   CAPTURE_TEST_ALLOW=1 npm run test:capture-flow
 * Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY, all migrations applied, and a 'premium' plan row.
 */
import 'dotenv/config';
import assert from 'assert';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { auditOrganization } from '../services/ledgerIntegrity.service';
import * as capture from '../services/capture/capture.service';
import { getCaptureSettings } from '../services/capture/capture.settings';
import { checkMetaTokens } from '../services/capture/capture.maintenance';
import { deleteMetaUserData } from '../services/meta.deletion';

const PRODUCTION_REF = 'ahatvfmvhecakpxtpnay';
if (process.env.CAPTURE_TEST_ALLOW !== '1' || String(process.env.SUPABASE_URL).includes(PRODUCTION_REF)) {
    console.error('Refusing to run: this writes to the database. Use a staging project and set CAPTURE_TEST_ALLOW=1.');
    process.exit(1);
}

const results: { name: string; ok: boolean }[] = [];
async function step(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push({ name, ok: true }); console.log(`  ok    ${name}`); }
    catch (e: any) { results.push({ name, ok: false }); console.log(`  FAIL  ${name}: ${e?.message}`); }
}

const today = () => new Date().toISOString().slice(0, 10);

async function makeOrg(label: string) {
    const stamp = `${Date.now()}-${label}`;
    const { data: org, error } = await supabase.from('organizations').insert({ name: `ZZ Capture Test ${stamp}`, slug: `zz-capture-${stamp}`.toLowerCase() }).select('id').single();
    if (error || !org) throw new Error(`Could not create org: ${error?.message}`);
    const orgId = org.id as string;
    const { error: subErr } = await supabase.from('organization_subscriptions').insert({ organization_id: orgId, plan_id: 'premium', status: 'active' });
    if (subErr) throw new Error(`Could not add subscription: ${subErr.message}`);
    await supabase.from('capture_settings').insert({ organization_id: orgId, enabled: true });
    const { data: income } = await supabase.from('accounts').insert({ organization_id: orgId, code: '4000', name: 'Sales', type: 'INCOME', subtype: 'REVENUE' }).select('id').single();
    const { data: wallet } = await supabase.from('organization_wallets').insert({ organization_id: orgId, name: 'Main Wallet', is_main: true }).select('id').single();
    const { data: external } = await supabase.from('external_wallets').insert({ organization_id: orgId, name: 'Cash', provider_type: 'CUSTOM' }).select('id').single();
    return { orgId, accountId: income!.id as string, walletId: wallet!.id as string, externalId: external!.id as string };
}

async function makeCapture(orgId: string, f: Record<string, any> = {}) {
    const at = f.occurred_at ?? new Date().toISOString();
    const { data, error } = await supabase.from('transaction_captures').insert({
        organization_id: orgId, source: 'RECEIPT_UPLOAD', dedupe_key: `test:${crypto.randomUUID()}`, status: 'NEEDS_REVIEW', direction: 'IN', amount: 450, currency: 'ZMW',
        zmw_amount: 450, occurred_at: at, occurred_on: at.slice(0, 10), confidence: 0.95, evidence_summary: 'Test capture', ...f,
    }).select('*').single();
    if (error || !data) throw new Error(`Could not create capture: ${error?.message}`);
    return data;
}

const lencoInflow = (orgId: string, walletId: string, amount = 450) => cashbookService.createEntry(orgId, {
    entry_type: 'INFLOW', description: 'Lenco inflow', debit: amount, credit: 0, date: today(), account_type: 'MONEYWISE_WALLET', wallet_id: walletId,
    status: 'COMPLETED', transaction_at: new Date().toISOString(), skip_inflow_notification: true, external_reference: `LENCO-${crypto.randomUUID()}`,
} as any);

const entryCount = async (orgId: string) => (await supabase.from('cashbook_entries').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)).count ?? 0;
const reload = async (id: string) => (await supabase.from('transaction_captures').select('*').eq('id', id).single()).data as any;

async function cleanup(orgId: string) {
    const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', orgId);
    const ids = (je || []).map((j: any) => j.id);
    for (let i = 0; i < ids.length; i += 200) await supabase.from('journal_lines').delete().in('journal_entry_id', ids.slice(i, i + 200));
    await supabase.from('journal_entries').delete().eq('organization_id', orgId);
    await supabase.from('transaction_captures').delete().eq('organization_id', orgId);
    await supabase.from('cashbook_entries').delete().eq('organization_id', orgId);
    for (const t of ['organization_wallets', 'external_wallets', 'accounts', 'organization_subscriptions']) await supabase.from(t).delete().eq('organization_id', orgId);
    const { error } = await supabase.from('organizations').delete().eq('id', orgId);
    if (error) console.log(`(left test organization ${orgId} behind: ${error.message})`);
}

async function main() {
    const { data: user } = await supabase.from('users').select('id').limit(1).single();
    const userId = user!.id as string;
    const a = await makeOrg('a');
    const b = await makeOrg('b');
    const settings = await getCaptureSettings(a.orgId);
    const edits = { wallet_id: a.externalId, account_id: a.accountId };

    try {
        await step('settings: Premium org with capture on is enabled', async () => assert.strictEqual(settings.enabled, true));

        await step('I4: two simultaneous approvals book one entry', async () => {
            const c = await makeCapture(a.orgId);
            const before = await entryCount(a.orgId);
            const runs = await Promise.allSettled([capture.approve(a.orgId, userId, c.id, edits), capture.approve(a.orgId, userId, c.id, edits)]);
            assert.ok(runs.some(r => r.status === 'fulfilled'));
            assert.strictEqual(await entryCount(a.orgId), before + 1);
            const again = await capture.approve(a.orgId, userId, c.id, edits);
            assert.strictEqual(again.alreadyApproved, true);
        });

        await step('I5: undo voids the entry and re-approve books a fresh one', async () => {
            const c = await makeCapture(a.orgId);
            const first = await capture.approve(a.orgId, userId, c.id, edits);
            await capture.undo(a.orgId, userId, c.id);
            const { data: voided } = await supabase.from('cashbook_entries').select('debit, credit').eq('id', first.entryId).single();
            assert.strictEqual(Number(voided!.debit), 0);
            assert.strictEqual((await reload(c.id)).status, 'NEEDS_REVIEW');
            const second = await capture.approve(a.orgId, userId, c.id, edits);
            assert.notStrictEqual(second.entryId, first.entryId);
        });

        await step('Dismiss books nothing and can be undone', async () => {
            const c = await makeCapture(a.orgId);
            const before = await entryCount(a.orgId);
            await capture.dismiss(a.orgId, userId, c.id);
            assert.strictEqual(await entryCount(a.orgId), before);
            await capture.undo(a.orgId, userId, c.id);
            assert.strictEqual((await reload(c.id)).status, 'NEEDS_REVIEW');
        });

        await step('I2: a chat after a Lenco inflow merges with no new entry', async () => {
            await lencoInflow(a.orgId, a.walletId, 451);
            const before = await entryCount(a.orgId);
            const c = await makeCapture(a.orgId, { status: 'NEW', amount: 451, zmw_amount: 451 });
            await capture.matchAndRoute(c, settings, { windowMin: 120, categorise: true });
            const after = await reload(c.id);
            assert.strictEqual(after.status, 'MERGED');
            assert.strictEqual(after.claim_state, 'CORROBORATED');
            assert.strictEqual(await entryCount(a.orgId), before);
        });

        await step('Two equal Lenco candidates go to review, never merge', async () => {
            await lencoInflow(a.orgId, a.walletId, 452);
            await lencoInflow(a.orgId, a.walletId, 452);
            const c = await makeCapture(a.orgId, { status: 'NEW', amount: 452, zmw_amount: 452 });
            await capture.matchAndRoute(c, settings, { windowMin: 120, categorise: false });
            const after = await reload(c.id);
            assert.strictEqual(after.status, 'NEEDS_REVIEW');
            assert.strictEqual(after.match_candidates.length, 2);
        });

        await step('I3: a capture flips to MERGED when the inflow arrives later', async () => {
            const c = await makeCapture(a.orgId, { amount: 453, zmw_amount: 453 });
            await lencoInflow(a.orgId, a.walletId, 453);
            await capture.rematchPending(Date.now() + 20_000, 100);
            assert.strictEqual((await reload(c.id)).status, 'MERGED');
        });

        await step('L2: money booked first, then seen in Lenco, is flagged', async () => {
            const c = await makeCapture(a.orgId, { amount: 454, zmw_amount: 454 });
            await capture.approve(a.orgId, userId, c.id, edits);
            await lencoInflow(a.orgId, a.walletId, 454);
            await capture.flagLateLencoDuplicates(Date.now() + 20_000, 100);
            assert.ok((await reload(c.id)).flags.includes('POSSIBLE_LENCO_DUPLICATE'));
        });

        await step('L3: a backdated capture keeps the books clean', async () => {
            const at = new Date(Date.now() - 30 * 86400_000).toISOString();
            const c = await makeCapture(a.orgId, { occurred_at: at, occurred_on: at.slice(0, 10), amount: 455, zmw_amount: 455 });
            await capture.approve(a.orgId, userId, c.id, edits);
            const audit = await auditOrganization(a.orgId);
            assert.deepStrictEqual(audit.findings.filter((f: any) => f.severity === 'ERROR' && f.code !== 'CAPTURE_POSSIBLE_LENCO_DUPLICATE'), []);
        });

        await step('L1: many random captures leave the books clean', async () => {
            const n = Number(process.env.CAPTURE_TEST_VOLUME || 100);
            for (let i = 0; i < n; i++) {
                const c = await makeCapture(a.orgId, { amount: 500 + i, zmw_amount: 500 + i });
                if (i % 3 === 0) await capture.dismiss(a.orgId, userId, c.id);
                else await capture.approve(a.orgId, userId, c.id, edits);
            }
            const audit = await auditOrganization(a.orgId);
            assert.strictEqual(audit.findings.filter((f: any) => f.code === 'CAPTURE_DOUBLE_BOOKED').length, 0);
        });

        await step('S1: another org cannot read or act on a capture', async () => {
            const c = await makeCapture(b.orgId);
            for (const call of [capture.detail(a.orgId, c.id), capture.approve(a.orgId, userId, c.id, edits), capture.dismiss(a.orgId, userId, c.id), capture.undo(a.orgId, userId, c.id)]) {
                await assert.rejects(call, (e: any) => e.httpStatus === 404);
            }
            assert.strictEqual((await reload(c.id)).status, 'NEEDS_REVIEW');
        });

        await step('S2: the anon key reads nothing from capture tables', async () => {
            const anon = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_ANON_KEY as string);
            for (const t of ['capture_settings', 'capture_attachments', 'transaction_captures', 'capture_jobs', 'inbound_emails', 'capture_conversations', 'capture_ai_usage', 'messaging_connections', 'messaging_messages', 'meta_deletion_requests']) {
                const { data } = await anon.from(t).select('*').limit(1);
                assert.strictEqual((data || []).length, 0, t);
            }
        });

        const external = `test-${crypto.randomUUID()}`;
        const { data: conn } = await supabase.from('messaging_connections').insert({ organization_id: a.orgId, platform: 'WHATSAPP', external_id: external, status: 'ACTIVE' }).select('id').single();
        const ingest = (messageId: string, contact: string) => supabase.rpc('ingest_meta_message', { p_platform: 'WHATSAPP', p_external_account_id: external, p_external_message_id: messageId, p_contact_id: contact, p_body: 'sent K450' });

        await step('S3 and idempotency: five deliveries make one message under the connection org', async () => {
            for (let i = 0; i < 5; i++) await ingest('wamid-1', 'contact-1');
            const { data } = await supabase.from('messaging_messages').select('organization_id').eq('connection_id', conn!.id).eq('external_message_id', 'wamid-1');
            assert.strictEqual(data?.length, 1);
            assert.strictEqual(data![0].organization_id, a.orgId);
        });

        await step('Deferral keeps attempts', async () => {
            await supabase.from('capture_jobs').update({ status: 'COMPLETED' }).eq('status', 'PENDING').eq('organization_id', b.orgId);
            const { data: claimed } = await supabase.rpc('claim_capture_jobs', { p_limit: 1 });
            assert.ok(claimed?.length, 'expected a queued job');
            await supabase.rpc('defer_capture_job', { p_job_id: claimed[0].job_id });
            const { data: job } = await supabase.from('capture_jobs').select('attempts, status').eq('id', claimed[0].job_id).single();
            assert.strictEqual(job!.status, 'PENDING');
            assert.strictEqual(job!.attempts, claimed[0].attempts - 1);
        });

        await step('AI budget stops at the limit', async () => {
            assert.strictEqual(await capture.reserveAiCall(b.orgId, 1), true);
            assert.strictEqual(await capture.reserveAiCall(b.orgId, 1), false);
        });

        await step('I6: an expired token marks the connection and notifies once', async () => {
            await supabase.from('messaging_connections').update({ token_expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', conn!.id);
            await checkMetaTokens();
            const { data: row } = await supabase.from('messaging_connections').select('status, notified_expired_at').eq('id', conn!.id).single();
            assert.strictEqual(row!.status, 'EXPIRED');
            assert.ok(row!.notified_expired_at);
            await supabase.from('messaging_connections').update({ status: 'ACTIVE', token_expires_at: null, notified_expired_at: null }).eq('id', conn!.id);
        });

        await step('I8: data deletion removes one person and nobody else', async () => {
            await ingest('wamid-2', 'contact-2');
            const code = await deleteMetaUserData('contact-2');
            assert.ok(code);
            const { data } = await supabase.from('messaging_messages').select('contact_id').eq('connection_id', conn!.id);
            assert.ok(!(data || []).some((m: any) => m.contact_id === 'contact-2'));
            assert.ok((data || []).some((m: any) => m.contact_id === 'contact-1'));
        });
    } finally {
        await cleanup(a.orgId);
        await cleanup(b.orgId);
    }

    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} capture flows passed`);
    process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

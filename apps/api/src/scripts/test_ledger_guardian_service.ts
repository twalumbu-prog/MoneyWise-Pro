/**
 * Ledger Guardian — service integration test. Real database writes on a THROWAWAY organization, SIMULATED Lenco (no real money moves).
 *   npx tsc -p . --outDir /tmp/apibuild --noEmit false && NODE_PATH=$PWD/node_modules node /tmp/apibuild/scripts/test_ledger_guardian_service.js
 * Seeds every defect class at once, then checks: report mode changes nothing; heal mode repairs exactly the safe things; re-running is a no-op;
 * the closing balance is verified against a full-pass baseline and drift is caught.
 */
import 'dotenv/config';
process.env.GUARDIAN_SKIP_FEE_CREDIT = '1';
import { supabase } from '../lib/supabase';
import { LencoService } from '../services/lenco.service';
import { cashbookService } from '../services/cashbook.service';
import { runOrgGuardian, readHealth, claimDebitBooking, releaseDebitClaim } from '../services/ledgerGuardian/guardian.service';
import { lusakaDay } from '../services/ledgerGuardian/core';

const results: { name: string; ok: boolean }[] = [];
const must = (c: any, msg: string) => { if (!c) throw new Error(msg); };
async function step(name: string, fn: () => Promise<void>) {
    try { await fn(); results.push({ name, ok: true }); console.log(`PASS  ${name}`); }
    catch (e: any) { results.push({ name, ok: false }); console.log(`FAIL  ${name} — ${e?.message}`); }
}
const L: any = LencoService;
const saved = { bal: L.getAccountBalance, tx: L.getAccountTransactions, col: L.getCollections, tr: L.listTransfers, st: L.getTransferStatus, mv: L.transferToLencoMerchant };
const uuid = () => crypto.randomUUID();
const round2 = (v: number) => Math.round(v * 100) / 100;

async function main() {
    const stamp = Date.now(); const ACCT = uuid(); const YEAR = new Date().getUTCFullYear();
    const { data: org, error } = await supabase.from('organizations').insert({ name: `ZZ Guardian ${stamp}`, slug: `zz-guardian-${stamp}`, lenco_subaccount_id: ACCT, lenco_secret_key: `test-key-${stamp}`, payment_test_mode: false }).select('id').single();
    if (!org) throw new Error(`could not create test org: ${error?.message}`);
    const ORG = (org as any).id as string;
    await supabase.from('accounts').insert({ organization_id: ORG, code: 'QB-1150040000', name: 'MoneyWise Wallet', type: 'ASSET', subtype: 'Bank' });
    const { data: wal } = await supabase.from('organization_wallets').insert({ organization_id: ORG, name: 'Main Wallet', is_main: true }).select('id').single();
    const W = (wal as any).id as string;

    // ── the Lenco world (hours ago → txn). Balance chain computed oldest-first.
    const H = 3600e3, NOW = Date.now();
    const spec = [
        { k: 't0', type: 'credit', amount: 500, ago: 60, ref: 'DEP-OPEN-1' },
        { k: 't1', type: 'credit', amount: 100, ago: 48, ref: 'DEP-A-PUB' },     // public sale: net 98 booked, commission 2 never swept
        { k: 't2', type: 'credit', amount: 50, ago: 40, ref: 'DEP-B-ACT' },      // activation deposit booked 49.50
        { k: 't3', type: 'credit', amount: 30, ago: 30, ref: 'DEP-C' },          // booked twice
        { k: 't4', type: 'debit', amount: 20, ago: 20, fee: 8.5 },               // clean outflow
        { k: 't5', type: 'credit', amount: 12.34, ago: 10, ref: 'DEP-D' },       // never booked
    ] as any[];
    const feed: any[] = []; let bal = 0; const T: Record<string, any> = {};
    for (const s of spec) {
        bal = round2(bal + (s.type === 'credit' ? s.amount : -(s.amount + (s.fee ?? 0))));
        const t = { id: uuid(), type: s.type, amount: s.amount.toFixed(2), datetime: new Date(NOW - s.ago * H).toISOString(), narration: s.type === 'credit' ? 'CUSTOMER PAYER' : 'Disbursement for Requisition #abc12345 / 2629', balance: bal.toFixed(2) };
        T[s.k] = { ...t, ref: s.ref }; feed.unshift(t);
    }
    const lencoLedger = bal;
    let lencoAvailable = bal; let transfers: any[] = []; const moved: any[] = [];
    L.getAccountBalance = async () => ({ availableBalance: lencoAvailable.toFixed(2), ledgerBalance: lencoLedger.toFixed(2) });
    L.getAccountTransactions = async () => ({ data: feed, meta: { pageCount: 1 } });
    L.getCollections = async () => ({ data: spec.filter((s: any) => s.ref).map((s: any) => ({ reference: s.ref, settlement: { id: T[s.k].id }, initiatedAt: T[s.k].datetime })), meta: { pageCount: 1 } });
    L.listTransfers = async () => ({ data: transfers, meta: { pageCount: 1 } });
    L.getTransferStatus = async (ref: string) => (moved.some(m => m.reference === ref) ? { status: 'successful' } : null);
    L.transferToLencoMerchant = async (payload: any, source: string) => { moved.push({ ...payload, source }); return { status: 'successful' }; };

    // ── the ledger, with every defect
    const mk = async (o: any) => { const { data, error } = await supabase.from('cashbook_entries').insert({ organization_id: ORG, wallet_id: W, account_type: 'MONEYWISE_WALLET', status: 'COMPLETED', entry_type: 'INFLOW', balance_after: 0, debit: 0, credit: 0, ...o }).select('id').single(); if (!data) throw new Error(error?.message); return (data as any).id as string; };
    const day = (k: string) => lusakaDay(T[k].datetime); const at = (k: string, plus = 60000) => new Date(Date.parse(T[k].datetime) + plus).toISOString();
    await mk({ date: day('t0'), created_at: at('t0'), debit: 500, external_reference: T.t0.id, description: 'Deposit', reference_number: `CR-${YEAR}-0010` });
    await mk({ date: day('t1'), created_at: at('t1'), debit: 98, external_reference: 'DEP-A-PUB', description: 'Sale: Item (x1)', reference_number: `REC-${YEAR}-0011` });
    await mk({ date: day('t2'), created_at: at('t2'), debit: 49.5, external_reference: 'DEP-B-ACT', description: 'Wallet Activation Deposit', reference_number: `CR-${YEAR}-0012` });
    const dupKeep = await mk({ date: day('t3'), created_at: at('t3'), debit: 30, external_reference: 'DEP-C', description: 'Deposit', reference_number: `CR-${YEAR}-0013` });
    const dupRaw = await mk({ date: day('t3'), created_at: at('t3', 120000), debit: 30, status: 'UNACCOUNTED', external_reference: T.t3.id, description: 'CUSTOMER PAYER', reference_number: `CR-${YEAR}-0014` });
    await mk({ date: day('t4'), created_at: at('t4'), credit: 28.5, entry_type: 'EXPENSE', external_reference: T.t4.id, description: T.t4.narration });
    // counter far behind (5 < 14), chain deliberately broken (all balance_after were left 0), a sync marker the heal should clear
    await supabase.from('reference_counters').insert({ organization_id: ORG, entity_type: 'INFLOW', year: YEAR, last_value: 11 });
    await supabase.from('app_settings').upsert({ key: `lenco_sync_marker:${ORG}`, value: { through: new Date().toISOString(), fullAt: new Date().toISOString(), syncedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    const rows = async () => ((await supabase.from('cashbook_entries').select('id, debit, credit, description, external_reference, balance_after').eq('organization_id', ORG)).data ?? []) as any[];
    const total = (rs: any[]) => round2(rs.reduce((a, r) => a + Number(r.debit) - Number(r.credit), 0));
    const counter = async () => Number(((await supabase.from('reference_counters').select('last_value').eq('organization_id', ORG).eq('entity_type', 'INFLOW').eq('year', YEAR).single()).data as any).last_value);

    try {
        await step('1. REPORT mode finds every seeded defect and changes NOTHING', async () => {
            process.env.LEDGER_GUARDIAN_MODE = 'report'; process.env.SWEEP_GUARANTEE = 'on';
            const before = await rows(); const c0 = await counter();
            const r = await runOrgGuardian(ORG, { full: true, persist: false, heal: false });
            const codes = new Set(r.health.issues.map(i => i.code));
            for (const c of ['COUNTER_BEHIND', 'DUPLICATE_ROWS', 'FEE_RETAINED_GAP', 'SWEEP_MISSING', 'MISSING_IN_LEDGER', 'BALANCE_CHAIN_BROKEN']) must(codes.has(c as any), `expected ${c}, got ${[...codes].join(',')}`);
            must(Math.abs(r.analysis!.closing.unexplained) < 0.02, `closing gap not fully explained: ${JSON.stringify(r.analysis!.closing)}`);
            const after = await rows();
            must(after.length === before.length && total(after) === total(before) && (await counter()) === c0 && moved.length === 0, 'report mode must not write or move money');
        });

        await step('2. HEAL mode repairs exactly the safe defects (counter, duplicate, retained fee, commission sweep, balance chain, forced re-sync)', async () => {
            process.env.LEDGER_GUARDIAN_MODE = 'heal';
            const r = await runOrgGuardian(ORG, { full: true, heal: true });
            const rs = await rows();
            must(await counter() >= 14, `counter should be aligned to 14, is ${await counter()}`);
            const zeroed = [rs.find(x => x.id === dupKeep), rs.find(x => x.id === dupRaw)].filter(x => Number(x.debit) === 0);
            must(zeroed.length === 1 && zeroed[0].id === dupRaw && /Reconciled/.test(zeroed[0].description) && zeroed[0].external_reference === T.t3.id, 'the RAW duplicate must be neutralised (kept: the descriptive row); its Lenco reference must be preserved');
            const feeRet = rs.find(x => x.external_reference === `FEERET-${T.t2.id}`);
            must(feeRet && Number(feeRet.debit) === 0.5, 'the K0.50 retained fee must be booked once');
            must(moved.length === 1 && moved[0].amount === 2 && moved[0].reference === 'SPLIT-DEP-A-PUB' && moved[0].source === ACCT, `commission K2.00 must be swept once to the settlement till, got ${JSON.stringify(moved)}`);
            const { data: mk } = await supabase.from('app_settings').select('key').eq('key', `lenco_sync_marker:${ORG}`);
            must(!mk?.length, 'MISSING transaction must force the next sync cycle to re-examine history');
            // balance chain rebuilt
            const ordered = (await supabase.from('cashbook_entries').select('id, date, created_at, debit, credit, balance_after').eq('organization_id', ORG)).data as any[];
            ordered.sort((a, b) => (a.date + a.created_at < b.date + b.created_at ? -1 : 1)); let run = 0;
            for (const x of ordered) { run = round2(run + Number(x.debit) - Number(x.credit)); must(Math.abs(run - Number(x.balance_after)) < 0.005, 'stored running balances must equal the running sum after healing'); }
            const { data: audit } = await supabase.from('audit_logs').select('action').eq('entity_id', ORG).eq('entity_type', 'LEDGER_GUARDIAN');
            const actions = new Set((audit ?? []).map((a: any) => a.action));
            for (const a of ['HEAL_COUNTER_BEHIND', 'HEAL_DUPLICATE_ROWS', 'HEAL_FEE_RETAINED_GAP', 'HEAL_SWEEP_MISSING']) must(actions.has(a), `audit trail missing ${a}`);
            must(r.health.healed.length >= 5, `expected >=5 heals, got ${r.health.healed.length}`);
        });

        await step('3. re-running is a no-op: nothing is booked, neutralised or swept twice', async () => {
            const before = await rows(); const mv = moved.length;
            const r = await runOrgGuardian(ORG, { full: true, heal: true });
            const after = await rows();
            must(after.length === before.length && total(after) === total(before), 'second heal run must not change the ledger');
            must(moved.length === mv, 'second run must not sweep again');
            must(!r.health.healed.some(h => /duplicate|retained|counter/.test(h.detail)), `unexpected heals: ${JSON.stringify(r.health.healed)}`);
        });

        await step('4. a clean org: full pass records a baseline and reports OK', async () => {
            // resolve the two remaining open items the way production does: the sweep appears on Lenco, the missing credit gets booked
            const sweepTxn = { id: uuid(), type: 'debit', amount: '2.00', datetime: new Date(NOW - 47.9 * H).toISOString(), narration: 'Split payment / 2627', balance: '0' };
            feed.unshift(sweepTxn);                       // newest-first feed; recompute balances oldest-first
            const ordered = [...feed].sort((a, b) => (a.datetime < b.datetime ? -1 : 1)); let b2 = 0;
            for (const t of ordered) { b2 = round2(b2 + (t.type === 'credit' ? Number(t.amount) : -(Number(t.amount) + (t === ordered.find(x => x.id === T.t4.id) ? 8.5 : 0)))); t.balance = b2.toFixed(2); }
            transfers = [{ id: uuid(), accountId: ACCT, status: 'successful', amount: '2.00', fee: '0.12', reference: 'SPLIT-DEP-A-PUB', initiatedAt: sweepTxn.datetime, completedAt: sweepTxn.datetime, creditAccount: { type: 'lenco-merchant' } }];
            await mk({ date: day('t5'), created_at: at('t5'), debit: 12.34, external_reference: T.t5.id, description: 'CUSTOMER PAYER', reference_number: `CR-${YEAR}-0099` });
            // the sweep's cash effect: Lenco now holds 2.00 less
            await supabase.rpc('recalculate_cashbook_balances', { p_organization_id: ORG, p_target_date: '1900-01-01', p_target_created_at: '1900-01-01T00:00:00Z', p_account_type: 'MONEYWISE_WALLET', p_wallet_id: W });
            const newLedger = b2; (L as any).getAccountBalance = async () => ({ availableBalance: newLedger.toFixed(2), ledgerBalance: newLedger.toFixed(2) });
            const r = await runOrgGuardian(ORG, { full: true, heal: true });
            must(r.health.status === 'OK', `expected OK, got ${r.health.status}: ${JSON.stringify(r.health.issues)}`);
            const h = await readHealth(ORG);
            must(h?.baseline && Math.abs(h.baseline.legacy) < 0.02, `a baseline must be stored: ${JSON.stringify(h?.baseline)}`);
            // the commission was swept and the retained fee booked — ledger now equals Lenco
            must(Math.abs(r.analysis!.closing.diff) < 0.02, `ledger must equal Lenco now, diff ${r.analysis!.closing.diff}`);
        });

        await step('5. incremental pass verifies the closing balance against the baseline and catches drift', async () => {
            const ok = await runOrgGuardian(ORG, { heal: true });
            must(ok.health.kind === 'incremental' && ok.health.status === 'OK', `incremental should be OK, got ${ok.health.kind}/${ok.health.status}`);
            const cur = await (L.getAccountBalance as any)(); const real = Number(cur.ledgerBalance);
            L.getAccountBalance = async () => ({ availableBalance: (real + 7).toFixed(2), ledgerBalance: (real + 7).toFixed(2) });   // K7 appears at Lenco with no transaction
            const drift = await runOrgGuardian(ORG, { heal: true });
            const d = drift.health.issues.find(i => i.code === 'CLOSING_UNEXPLAINED');
            must(drift.health.kind === 'incremental' && !!d && Math.abs((drift.health.closing as any).drift + 7) < 0.02, `drift of K-7 expected, got ${JSON.stringify(drift.health.closing)} / ${JSON.stringify(drift.health.issues)}`);
            must(drift.health.status === 'ATTENTION', 'unexplained drift needs a human');
            L.getAccountBalance = async () => ({ availableBalance: real.toFixed(2), ledgerBalance: real.toFixed(2) });
        });

        await step('6. a held lock makes an overlapping run stand down (no double healing)', async () => {
            await supabase.from('app_settings').upsert({ key: `guardian_lock:${ORG}`, value: { until: new Date(Date.now() + 60000).toISOString() }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
            const r = await runOrgGuardian(ORG, { heal: true });
            must(r.skipped === 'locked', `expected skipped=locked, got ${r.skipped}`);
            await supabase.from('app_settings').delete().eq('key', `guardian_lock:${ORG}`);
        });

        await step('7. outflow booking claims: exactly one run can book a given debit; a crashed claim is retaken, a booked one never is', async () => {
            const tx = uuid();
            must(await claimDebitBooking(ORG, tx) === true, 'first claim wins');
            must(await claimDebitBooking(ORG, tx) === false, 'a second run must not book the same outflow');
            await releaseDebitClaim(ORG, tx);
            must(await claimDebitBooking(ORG, tx) === true, 'after a failed booking the claim is released and can be retried');
            await supabase.from('app_settings').update({ value: { at: new Date(Date.now() - 20 * 60000).toISOString() } }).eq('key', `lenco_booked:${ORG}:${tx}`);
            must(await claimDebitBooking(ORG, tx) === true, 'a 20-minute-old claim with no ledger row is a crashed run: retake it');
            await supabase.from('app_settings').update({ value: { at: new Date(Date.now() - 20 * 60000).toISOString() } }).eq('key', `lenco_booked:${ORG}:${tx}`);
            await mk({ date: day('t4'), created_at: at('t4'), credit: 1, entry_type: 'EXPENSE', external_reference: tx, description: 'booked after all' });
            must(await claimDebitBooking(ORG, tx) === false, 'an old claim whose ledger row exists is a booked outflow: never retake');
        });

        await step('8. WRITE PATH: createEntry survives a reference counter that is behind (the Kids Paradise failure) — books the entry instead of failing', async () => {
            // counter is behind the numbers in use: reset it to 9 so the NEXT number (…-0010) already exists
            await supabase.from('reference_counters').update({ last_value: 9 }).eq('organization_id', ORG).eq('entity_type', 'INFLOW').eq('year', YEAR);
            const e = await cashbookService.createEntry(ORG, { date: new Date().toISOString().slice(0, 10), description: 'Customer payment after the cutover', debit: 482.13, credit: 0, entry_type: 'INFLOW', account_type: 'MONEYWISE_WALLET', status: 'COMPLETED', wallet_id: W, external_reference: `SELFHEAL-${uuid()}`, skip_inflow_notification: true } as any);
            must(!!e.id && /^CR-\d{4}-\d+$/.test(String((e as any).reference_number)), `entry must be created with a fresh CR- number, got ${(e as any).reference_number}`);
            const used = (await supabase.from('cashbook_entries').select('reference_number').eq('organization_id', ORG).like('reference_number', `CR-${YEAR}-%`)).data as any[];
            must(new Set(used.map(r => r.reference_number)).size === used.length, 'reference numbers must stay unique');
            must(await counter() >= 14, `the counter must have been realigned past the numbers in use, is ${await counter()}`);
            // a caller-chosen reference that collides is NOT silently rewritten
            let threw = false;
            try { await cashbookService.createEntry(ORG, { date: new Date().toISOString().slice(0, 10), description: 'x', debit: 1, credit: 0, entry_type: 'INFLOW', account_type: 'MONEYWISE_WALLET', status: 'COMPLETED', wallet_id: W, reference_number: `CR-${YEAR}-0010`, skip_inflow_notification: true } as any); } catch { threw = true; }
            must(threw, 'a collision on a reference the CALLER chose must still fail loudly');
        });
    } finally {
        Object.assign(L, { getAccountBalance: saved.bal, getAccountTransactions: saved.tx, getCollections: saved.col, listTransfers: saved.tr, getTransferStatus: saved.st, transferToLencoMerchant: saved.mv });
        const { data: je } = await supabase.from('journal_entries').select('id').eq('organization_id', ORG);
        const ids = (je ?? []).map((j: any) => j.id);
        for (let i = 0; i < ids.length; i += 100) await supabase.from('journal_lines').delete().in('journal_entry_id', ids.slice(i, i + 100));
        await supabase.from('journal_entries').delete().eq('organization_id', ORG);
        await supabase.from('cashbook_entries').delete().eq('organization_id', ORG);
        await supabase.from('audit_logs').delete().eq('entity_id', ORG);
        await supabase.from('reference_counters').delete().eq('organization_id', ORG);
        await supabase.from('app_settings').delete().like('key', `%${ORG}%`);
        await supabase.from('organization_wallets').delete().eq('organization_id', ORG);
        await supabase.from('accounts').delete().eq('organization_id', ORG);
        await supabase.from('organizations').delete().eq('id', ORG);
        console.log('\n(test organization removed)');
    }
    const failed = results.filter(r => !r.ok).length;
    console.log(`${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });

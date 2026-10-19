/**
 * Ledger Guardian — the I/O layer around the pure analysis core (core.ts).
 *
 * After every sync cycle (≤5 min after any transaction) it re-verifies, per organization, that
 *   • every Lenco transaction is in the ledger exactly once, at the amount that really moved,
 *   • every public sale's commission was swept (and every other credit was booked in full),
 *   • reference counters and stored running balances are sound,
 *   • the ledger total equals Lenco's balance (a daily FULL pass sets a baseline; frequent incremental passes
 *     verify the closing balance against it exactly),
 * and repairs whatever is provably safe to repair. Everything else is reported with the exact rows and amounts.
 *
 * Modes (env LEDGER_GUARDIAN_MODE): 'off' | 'report' (DEFAULT — analyse + record health, change nothing) | 'heal'
 * (additionally apply the whitelisted safe repairs). Commission sweeps move real money, so they additionally need
 * SWEEP_GUARANTEE=on. Every repair is idempotent, re-validated against live data just before it is applied, backed by an
 * audit_logs row, and never deletes anything (duplicates are zeroed and labelled, keeping their references so the sync's
 * duplicate check keeps recognising them).
 */
import { supabase } from '../../lib/supabase';
import { LencoService } from '../lenco.service';
import { ledgerService } from '../ledger.service';
import { cashbookService } from '../cashbook.service';
import { sweepPlatformCommission, SETTLEMENT_ORG_ID } from '../commissionSweep.service';
import { raiseReferenceCounter } from '../referenceCounters';
import { captureEvent } from '../../utils/analytics';
import { analyze, Analysis, Issue, LedgerRow, LencoTxn, enrichTxns, lusakaDay, rowAmount, MAX_FEE_ABS, MAX_FEE_RATIO, CLOSING_TOLERANCE, RawLencoTxn } from './core';

export type GuardianMode = 'off' | 'report' | 'heal';
export const guardianMode = (): GuardianMode => {
    const m = String(process.env.LEDGER_GUARDIAN_MODE || 'report').toLowerCase();
    return m === 'off' || m === 'heal' ? m : 'report';
};
export const sweepGuaranteeEnabled = () => String(process.env.SWEEP_GUARANTEE || 'off').toLowerCase() === 'on';

const DAY_MS = 24 * 3600 * 1000;
const WINDOW_DAYS = 3;                    // incremental window (matches the sync's overlap)
const FULL_PASS_MS = 24 * 3600 * 1000;    // baseline refresh
const MAX_FULL_PAGES = 40;
const HEALTH_KEY = (orgId: string) => `ledger_health:${orgId}`;
const LOCK_KEY = (orgId: string) => `guardian_lock:${orgId}`;
const SYNC_MARKER_KEY = (orgId: string) => `lenco_sync_marker:${orgId}`;
const FAIL_KEY = (orgId: string, txnId: string) => `lenco_sync_fail:${orgId}:${txnId}`;

interface OrgRow { id: string; name: string; lenco_subaccount_id: string | null; lenco_secret_key: string | null; lenco_sync_cutoff_date: string | null; payment_test_mode: boolean | null }
interface Baseline { fullAt: string; windowFrom: string; legacy: number; outside: number }
export interface Health {
    status: 'OK' | 'HEALABLE' | 'ATTENTION' | 'ERROR';
    checkedAt: string; mode: GuardianMode; kind: 'full' | 'incremental';
    closing?: Analysis['closing'] & { drift?: number };
    issues: Array<Pick<Issue, 'code' | 'severity' | 'safe' | 'message' | 'txnId' | 'amount'>>;
    healed: Array<{ code: string; detail: string }>;
    baseline?: Baseline | null;
    stuck?: Record<string, number>;
    error?: string;
}

// ─────────────────────────────────────────── sync failure ledger ─────────────────────────────────────────────
// The sync used to log a per-transaction failure and move on, so one rejected booking was invisible for days.

export async function recordSyncFailure(orgId: string, txnId: string, message: string): Promise<void> {
    try {
        const key = FAIL_KEY(orgId, txnId);
        const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
        const prev: any = (data as any)?.value;
        await supabase.from('app_settings').upsert({
            key, description: 'Lenco sync: a transaction that could not be booked (cleared automatically on success).', updated_at: new Date().toISOString(),
            value: { count: (prev?.count ?? 0) + 1, firstAt: prev?.firstAt ?? new Date().toISOString(), lastAt: new Date().toISOString(), error: String(message).slice(0, 300) },
        }, { onConflict: 'key' });
        console.error(`[Lenco Sync][BOOKING-FAILED] org ${orgId.slice(0, 8)} txn ${txnId}: ${message}`);
    } catch { /* never let bookkeeping about a failure break the sync */ }
}
export async function clearSyncFailure(orgId: string, txnId: string): Promise<void> {
    try { await supabase.from('app_settings').delete().eq('key', FAIL_KEY(orgId, txnId)); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────── loading ─────────────────────────────────────────────────────

async function loadOrg(orgId: string): Promise<OrgRow | null> {
    const { data } = await supabase.from('organizations')
        .select('id, name, lenco_subaccount_id, lenco_secret_key, lenco_sync_cutoff_date, payment_test_mode').eq('id', orgId).maybeSingle();
    return (data as any) ?? null;
}

async function loadLedger(orgId: string): Promise<LedgerRow[]> {
    const out: LedgerRow[] = [];
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('cashbook_entries')
            .select('id, wallet_id, date, created_at, debit, credit, balance_after, status, entry_type, description, external_reference, reference_number, requisition_id')
            .eq('organization_id', orgId).eq('account_type', 'MONEYWISE_WALLET').range(from, from + 999);
        if (error) throw new Error(`ledger read failed: ${error.message}`);
        out.push(...((data as any[]) ?? []));
        if (!data || data.length < 1000) break;
    }
    return out;
}

const pageList = (resp: any): any[] => (Array.isArray(resp?.data) ? resp.data : Array.isArray(resp?.data?.data) ? resp.data.data : Array.isArray(resp) ? resp : []);
const pageCount = (resp: any): number | null => { const v = resp?.meta?.pageCount ?? resp?.meta?.pagination?.lastPage ?? resp?.data?.meta?.pageCount; return typeof v === 'number' ? v : null; };

/** Newest-first paging with an early stop once a page is entirely older than `stopBefore`. Returns whether the list is complete. */
async function pageUntil(fetchPage: (p: number) => Promise<any>, dateOf: (x: any) => string, stopBefore: number | null, maxPages: number): Promise<{ items: any[]; complete: boolean }> {
    const items: any[] = [];
    for (let p = 1; p <= maxPages; p++) {
        const resp = await fetchPage(p);
        const batch = pageList(resp);
        if (!batch.length) return { items, complete: true };
        items.push(...batch);
        const last = pageCount(resp);
        if (last !== null && p >= last) return { items, complete: true };
        if (stopBefore !== null && batch.every(x => Date.parse(dateOf(x)) < stopBefore)) return { items, complete: false };
    }
    return { items, complete: false };
}

export interface Snapshot {
    org: OrgRow; ledger: LedgerRow[]; txns: RawLencoTxn[]; complete: boolean;
    balance: { available: number; ledger: number };
    refByTxnId: Map<string, string>; feeByTxnId: Map<string, number>; payoutRefsByRequisition: Map<string, string[]>; failedPayoutRefs: Set<string>;
    counters: Array<{ entity_type: string; year: number; last_value: number }>;
    key: string; accountId: string;
}

export async function loadSnapshot(org: OrgRow, windowStartMs: number | null): Promise<Snapshot> {
    const accountId = org.lenco_subaccount_id!;
    const key = org.lenco_secret_key || process.env.LENCO_SECRET_KEY || '';
    const stopBefore = windowStartMs === null ? null : windowStartMs - DAY_MS;      // a day of margin for the running-balance maths
    const maxPages = windowStartMs === null ? MAX_FULL_PAGES : 12;

    const [ledger, bal, tx] = await Promise.all([
        loadLedger(org.id),
        LencoService.getAccountBalance(accountId, key),
        pageUntil(p => LencoService.getAccountTransactions(accountId, { page: p }, key), x => x.datetime, stopBefore, maxPages),
    ]);
    const available = parseFloat(bal?.availableBalance ?? bal?.balance ?? '0') || 0;
    const ledgerBal = parseFloat(bal?.ledgerBalance ?? bal?.availableBalance ?? '0') || available;

    // references: collections give DEP-/REF- merchant references for credits; transfers give payout references (+ failures) for debits
    const refByTxnId = new Map<string, string>();
    const transfersStop = windowStartMs === null ? null : windowStartMs - 7 * DAY_MS;
    const [cols, trs] = await Promise.all([
        pageUntil(p => LencoService.getCollections({ page: p }, key), x => x.initiatedAt || x.createdAt || '', transfersStop, windowStartMs === null ? MAX_FULL_PAGES : 6).catch(() => ({ items: [] as any[], complete: false })),
        pageUntil(p => LencoService.listTransfers({ page: p }, key), x => x.initiatedAt || x.createdAt || '', transfersStop, windowStartMs === null ? 15 : 4).catch(() => ({ items: [] as any[], complete: false })),
    ]);
    for (const c of cols.items) if (c?.settlement?.id && c?.reference) refByTxnId.set(c.settlement.id, c.reference);

    const mine = trs.items.filter((t: any) => t.accountId === accountId);
    const failedPayoutRefs = new Set<string>(mine.filter((t: any) => String(t.status).toLowerCase() === 'failed' && t.reference).map((t: any) => t.reference));
    const feeByTxnId = new Map<string, number>();
    const usedTransfers = new Set<string>();
    for (const d of tx.items.filter((x: any) => String(x.type).toLowerCase() === 'debit')) {
        const amount = parseFloat(d.amount);
        let best: { dt: number; t: any } | null = null;
        for (const t of mine) {
            if (usedTransfers.has(t.id) || String(t.status).toLowerCase() !== 'successful' || Math.abs(parseFloat(t.amount) - amount) > 0.005) continue;
            const dt = Math.abs(Date.parse(t.completedAt || t.initiatedAt) - Date.parse(d.datetime));
            if (dt < 10 * 60000 && (!best || dt < best.dt)) best = { dt, t };
        }
        if (best) {
            usedTransfers.add(best.t.id); if (best.t.reference) refByTxnId.set(d.id, best.t.reference);
            // Lenco reports a fee on Lenco-to-Lenco transfers too, but never charges it (verified over 144 transfers) — only external payouts carry a real one.
            if (best.t.creditAccount?.type !== 'lenco-merchant' && best.t.fee != null) feeByTxnId.set(d.id, parseFloat(best.t.fee) || 0);
        }
    }

    // requisition → every payout attempt reference (REQ-…, REQ-…-R1, MWPAY-…)
    const payoutRefsByRequisition = new Map<string, string[]>();
    const { data: disb } = await supabase.from('disbursements').select('requisition_id, external_reference').eq('organization_id', org.id);
    for (const d of (disb as any[]) ?? []) {
        const base = String(d.external_reference ?? '').trim(); if (!d.requisition_id || !base) continue;
        const attempts = mine.map((t: any) => t.reference as string).filter(r => r && (r === base || r.startsWith(`${base}-R`)));
        payoutRefsByRequisition.set(d.requisition_id, attempts.length ? attempts : [base]);
    }
    const { data: counters } = await supabase.from('reference_counters').select('entity_type, year, last_value').eq('organization_id', org.id);

    return { org, ledger, txns: tx.items as RawLencoTxn[], complete: tx.complete, balance: { available, ledger: ledgerBal }, refByTxnId, feeByTxnId, payoutRefsByRequisition, failedPayoutRefs, counters: (counters as any[]) ?? [], key, accountId };
}

// ─────────────────────────────────────────────── health + lock ───────────────────────────────────────────────

export async function readHealth(orgId: string): Promise<Health | null> {
    const { data } = await supabase.from('app_settings').select('value').eq('key', HEALTH_KEY(orgId)).maybeSingle();
    return ((data as any)?.value as Health) ?? null;
}
async function writeHealth(orgId: string, h: Health) {
    await supabase.from('app_settings').upsert({ key: HEALTH_KEY(orgId), value: h, description: 'Ledger Guardian: latest verification result for this organization.', updated_at: new Date().toISOString() }, { onConflict: 'key' });
}
async function acquireLock(orgId: string, ttlMs = 120_000): Promise<boolean> {
    const until = new Date(Date.now() + ttlMs).toISOString();
    const { error } = await supabase.from('app_settings').insert({ key: LOCK_KEY(orgId), value: { until }, description: 'Ledger Guardian run lock (expires on its own).', updated_at: new Date().toISOString() });
    if (!error) return true;
    const { data } = await supabase.from('app_settings').select('value').eq('key', LOCK_KEY(orgId)).maybeSingle();
    if (Date.parse((data as any)?.value?.until ?? '') > Date.now()) return false;
    await supabase.from('app_settings').upsert({ key: LOCK_KEY(orgId), value: { until }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    return true;
}
const releaseLock = (orgId: string) => supabase.from('app_settings').delete().eq('key', LOCK_KEY(orgId)).then(() => undefined, () => undefined);

// ─────────────────────────────────────────────── healing ─────────────────────────────────────────────────────

const TAG = () => `[Reconciled: ${new Date().toISOString().slice(0, 10)} guardian]`;
async function audit(orgId: string, action: string, changes: any) {
    await supabase.from('audit_logs').insert({ entity_type: 'LEDGER_GUARDIAN', entity_id: orgId, action, changes }).then(() => undefined, () => undefined);
}

interface HealCtx { org: OrgRow; snap: Snapshot; txnById: Map<string, LencoTxn>; wallets: Set<string>; touched: string[]; mode: GuardianMode; analysisDay: string }

async function healIssue(i: Issue, ctx: HealCtx): Promise<string | null> {
    const { org } = ctx;
    switch (i.code) {
        case 'COUNTER_BEHIND': {
            await raiseReferenceCounter(org.id, i.entity!.type, i.entity!.year, i.entity!.to);
            await audit(org.id, 'HEAL_COUNTER_BEHIND', i.entity);
            return `counter ${i.entity!.type} ${i.entity!.year} → ${i.entity!.to}`;
        }
        case 'BALANCE_CHAIN_BROKEN': { ctx.wallets.add(i.walletId ?? 'null'); return `wallet ${String(i.walletId).slice(0, 8)} running balances rebuilt`; }
        case 'DUPLICATE_ROWS': {
            const { data: keep } = await supabase.from('cashbook_entries').select('id, debit, credit, status').eq('id', i.keepId!).maybeSingle();
            if (!keep || (Number((keep as any).debit) === 0 && Number((keep as any).credit) === 0)) return null;   // the keeper must be a live, non-zero row
            const done: string[] = [];
            for (const id of i.entryIds ?? []) {
                const { data: r } = await supabase.from('cashbook_entries').select('id, debit, credit, status, description, wallet_id').eq('id', id).maybeSingle();
                if (!r || String((r as any).status).toUpperCase() === 'PENDING' || (Number((r as any).debit) === 0 && Number((r as any).credit) === 0)) continue;
                const was = Number((r as any).debit) - Number((r as any).credit);
                const { error } = await supabase.from('cashbook_entries').update({ debit: 0, credit: 0, description: `${TAG()} duplicate of ${i.keepId!.slice(0, 8)} (Lenco txn ${i.txnId?.slice(0, 8)}) | was ${was >= 0 ? '+' : ''}${was.toFixed(2)} | ${(r as any).description ?? ''}` }).eq('id', id);
                if (error) continue;
                ctx.touched.push(id); ctx.wallets.add((r as any).wallet_id ?? 'null'); done.push(id.slice(0, 8));
                await audit(org.id, 'HEAL_DUPLICATE_ROWS', { zeroed: id, keeper: i.keepId, lencoTxn: i.txnId, wasAmount: was });
            }
            return done.length ? `neutralised duplicate row(s) ${done.join(', ')}` : null;
        }
        case 'FEE_RETAINED_GAP': {
            const t = ctx.txnById.get(i.txnId!); const gap = i.amount!;
            if (!t || gap <= 0 || gap > Math.min(t.amount * MAX_FEE_RATIO, MAX_FEE_ABS)) return null;
            const ext = `FEERET-${t.id}`;
            const { data: exists } = await supabase.from('cashbook_entries').select('id').eq('organization_id', org.id).eq('external_reference', ext).limit(1);
            if (exists?.length) return null;
            const { data: base } = await supabase.from('cashbook_entries').select('wallet_id, date').eq('id', i.entryIds![0]).maybeSingle();
            const e = await cashbookService.createEntry(org.id, {
                date: t.day, description: `Customer-paid transaction fee retained in the wallet — ${t.narration}`.slice(0, 200), debit: gap, credit: 0, entry_type: 'INFLOW',
                account_type: 'MONEYWISE_WALLET', status: 'COMPLETED', wallet_id: (base as any)?.wallet_id ?? null, external_reference: ext, transaction_at: t.datetime, skip_inflow_notification: true,
            } as any);
            if (e.id) ctx.touched.push(e.id);
            ctx.wallets.add((base as any)?.wallet_id ?? 'null');
            await audit(org.id, 'HEAL_FEE_RETAINED_GAP', { lencoTxn: t.id, amount: gap, entry: e.id });
            return `booked K${gap} retained fee for ${t.id.slice(0, 8)}`;
        }
        case 'SWEEP_MISSING': {
            if (!sweepGuaranteeEnabled()) return null;
            const t = ctx.txnById.get(i.txnId!); const gap = i.amount!;
            if (!t || org.id === SETTLEMENT_ORG_ID || org.payment_test_mode || gap <= 0 || gap > Math.min(t.amount * MAX_FEE_RATIO, MAX_FEE_ABS)) return null;
            if (ctx.snap.balance.available < gap + 1) return null;                         // never overdraw the account
            const { data: row } = await supabase.from('cashbook_entries').select('external_reference').eq('id', i.entryIds![0]).maybeSingle();
            const merchantRef = String((row as any)?.external_reference ?? '');
            const originalRef = /^DEP-/.test(merchantRef) ? merchantRef : t.id;           // SPLIT-<ref>: deterministic, so a retry can never double-sweep
            const outcome = await sweepPlatformCommission(ctx.snap.accountId, ctx.snap.key, gap, originalRef, org.id);
            if (outcome !== 'succeeded') return null;                                        // failed → retried next cycle; skipped → already swept (it will pair on a later pass)
            {
                if (process.env.GUARDIAN_SKIP_FEE_CREDIT !== '1') import('../../controllers/billing.controller').then(m => m.recordFeeCredit(org.id, gap, originalRef, 'PAYMENT_LINK')).catch(() => undefined);
                await audit(org.id, 'HEAL_SWEEP_MISSING', { lencoTxn: t.id, commission: gap, reference: `SPLIT-${originalRef}` });
            }
            return `commission K${gap} for ${t.id.slice(0, 8)} swept`;
        }
        case 'SWEEP_NOT_IN_LEDGER': {
            // Same policy and shape as reconciliation.service healMissingPlatformFees: post the unabsorbed sweep as an EXPENSE keyed by the
            // Lenco transaction id (idempotent — the cron heal and this one can never double-post it).
            const t = ctx.txnById.get(i.txnId!);
            if (!t || t.gross <= 0 || t.gross > MAX_FEE_ABS) return null;
            const { data: exists } = await supabase.from('cashbook_entries').select('id').eq('organization_id', org.id).eq('external_reference', t.id).limit(1);
            if (exists?.length) return null;
            const { data: main } = await supabase.from('organization_wallets').select('id').eq('organization_id', org.id).eq('is_main', true).maybeSingle();
            if (!main) return null;
            const e = await cashbookService.createEntry(org.id, {
                date: t.day, description: `${t.narration} [auto-healed — unposted MoneyWise platform-fee sweep, verified unabsorbed against Lenco]`.slice(0, 220),
                debit: 0, credit: t.gross, entry_type: 'EXPENSE', account_type: 'MONEYWISE_WALLET', status: 'COMPLETED', wallet_id: (main as any).id,
                external_reference: t.id, transaction_at: t.datetime,
            } as any);
            if (e.id) ctx.touched.push(e.id);
            ctx.wallets.add((main as any).id);
            await audit(org.id, 'HEAL_SWEEP_NOT_IN_LEDGER', { lencoTxn: t.id, amount: t.gross, entry: e.id });
            return `posted K${t.gross} platform-fee sweep ${t.id.slice(0, 8)}`;
        }
        case 'MISSING_IN_LEDGER': {
            // The canonical booking path is the sync (it knows sales, intents, CHG- netting, cut-offs). Do not re-implement it:
            // make sure the next cycle re-examines everything for this org (counters were realigned above, so it can book).
            const { data: marker } = await supabase.from('app_settings').select('key').eq('key', SYNC_MARKER_KEY(org.id)).maybeSingle();
            if (!marker) return null;                                                      // already forced; nothing new to do (keeps the heal idempotent)
            await supabase.from('app_settings').delete().eq('key', SYNC_MARKER_KEY(org.id));
            return `next sync cycle forced to re-examine all history (txn ${i.txnId?.slice(0, 8)})`;
        }
        default: return null;
    }
}

// ─────────────────────────────────────────────── the run ─────────────────────────────────────────────────────

export interface RunOptions { full?: boolean; persist?: boolean; heal?: boolean; now?: number; /** false → never start a full-history pass (used inside the time-boxed sync) */ allowFull?: boolean }
export interface RunResult { org: string; analysis?: Analysis; health: Health; skipped?: string }

/** Verifies one organization (and heals, when allowed). Never throws. */
export async function runOrgGuardian(orgId: string, opts: RunOptions = {}): Promise<RunResult> {
    const mode = guardianMode();
    const persist = opts.persist !== false;
    const mayHeal = opts.heal ?? mode === 'heal';
    const now = opts.now ?? Date.now();
    const empty = (status: Health['status'], extra: Partial<Health> = {}): Health => ({ status, checkedAt: new Date(now).toISOString(), mode, kind: 'incremental', issues: [], healed: [], ...extra });
    if (mode === 'off' && persist) return { org: orgId, health: empty('OK'), skipped: 'mode=off' };

    const org = await loadOrg(orgId);
    if (!org?.lenco_subaccount_id) return { org: orgId, health: empty('OK'), skipped: 'no Lenco account' };
    if (persist && !(await acquireLock(orgId))) return { org: orgId, health: empty('OK'), skipped: 'locked' };
    try {
        const prev = persist ? await readHealth(orgId) : null;
        const baseline = prev?.baseline ?? null;
        const full = opts.full || !baseline || now - Date.parse(baseline.fullAt) > FULL_PASS_MS;
        if (full && opts.allowFull === false) return { org: orgId, health: prev ?? empty('OK'), skipped: 'full pass pending' };
        const windowFrom = full ? null : baseline!.windowFrom;
        const snap = await loadSnapshot(org, windowFrom ? Date.parse(windowFrom) : null);
        const complete = full && snap.complete;

        const analysis = analyze({
            ledger: snap.ledger, txns: snap.txns, balance: snap.balance, refByTxnId: snap.refByTxnId, feeByTxnId: snap.feeByTxnId,
            payoutRefsByRequisition: snap.payoutRefsByRequisition, failedPayoutRefs: snap.failedPayoutRefs, counters: snap.counters,
            cutoffDate: org.lenco_sync_cutoff_date, windowStart: windowFrom, complete, now, isSettlementOrg: org.id === SETTLEMENT_ORG_ID,
        });
        const issues = [...analysis.issues];

        // Incremental closing check against the last full-pass baseline (exact, not a heuristic).
        let drift: number | undefined;
        if (!full && baseline) {
            const windowEffects = analysis.effects.reduce((a, e) => a + e.effect, 0);
            drift = Math.round((analysis.closing.diff - (baseline.legacy + baseline.outside + windowEffects)) * 100) / 100;
            if (Math.abs(drift) > CLOSING_TOLERANCE) {
                issues.push({ code: 'CLOSING_UNEXPLAINED', severity: 'critical', safe: false, amount: drift,
                    message: `Closing balance drifted by K${drift} since the last full verification (ledger K${analysis.closing.ledgerSum} vs Lenco K${analysis.closing.lencoLedger}) and no row-level issue explains it.` });
            }
        }

        // heal (whitelist only)
        const healed: Health['healed'] = [];
        const ctx: HealCtx = { org, snap, txnById: new Map(enrichTxns(snap.txns, snap.refByTxnId, snap.feeByTxnId).map(t => [t.id, t])), wallets: new Set(), touched: [], mode, analysisDay: lusakaDay(new Date(now).toISOString()) };
        if (mayHeal) {
            const order: Record<string, number> = { COUNTER_BEHIND: 0, DUPLICATE_ROWS: 1, FEE_RETAINED_GAP: 2, SWEEP_NOT_IN_LEDGER: 2, SWEEP_MISSING: 3, MISSING_IN_LEDGER: 4, BALANCE_CHAIN_BROKEN: 9 };
            for (const i of issues.filter(x => x.safe).sort((a, b) => (order[a.code] ?? 5) - (order[b.code] ?? 5))) {
                try { const d = await healIssue(i, ctx); if (d) healed.push({ code: i.code, detail: d }); }
                catch (e: any) { console.error(`[LedgerGuardian] heal ${i.code} failed for ${org.name}:`, e?.message); }
            }
            for (const t of ctx.touched) await ledgerService.repostForCashbookEntry(t).catch(() => undefined);
            for (const w of ctx.wallets) {
                await supabase.rpc('recalculate_cashbook_balances', { p_organization_id: org.id, p_target_date: '1900-01-01', p_target_created_at: '1900-01-01T00:00:00Z', p_account_type: 'MONEYWISE_WALLET', p_wallet_id: w === 'null' ? null : w });
            }
        }

        // stuck bookings: a missing transaction that survives several heal cycles needs a human
        const stuck: Record<string, number> = { ...(prev?.stuck ?? {}) };
        const missingNow = new Set(issues.filter(i => i.code === 'MISSING_IN_LEDGER' && i.txnId).map(i => i.txnId!));
        for (const k of Object.keys(stuck)) if (!missingNow.has(k)) delete stuck[k];
        for (const id of missingNow) {
            stuck[id] = (stuck[id] ?? 0) + 1;
            if (stuck[id] >= 3) {
                const { data: f } = await supabase.from('app_settings').select('value').eq('key', FAIL_KEY(org.id, id)).maybeSingle();
                const why = (f as any)?.value?.error ? ` Last booking error: ${(f as any).value.error}` : '';
                const iss = issues.find(i => i.code === 'MISSING_IN_LEDGER' && i.txnId === id)!;
                iss.safe = false; iss.message += ` Still unbooked after ${stuck[id]} checks.${why}`;
            }
        }

        if (persist) {                                    // forget booking failures for transactions that are no longer missing
            const { data: fails } = await supabase.from('app_settings').select('key').like('key', `lenco_sync_fail:${org.id}:%`);
            for (const f of (fails as any[]) ?? []) if (!missingNow.has(String(f.key).split(':').pop()!)) await supabase.from('app_settings').delete().eq('key', f.key);
        }

        const actionable = issues.filter(i => i.severity !== 'info');
        const healedAll = healed.length > 0;
        const status: Health['status'] = actionable.length === 0 ? 'OK' : (actionable.every(i => i.safe) ? 'HEALABLE' : 'ATTENTION');

        // baseline: only trustworthy from a complete pass that changed nothing (a heal alters history → re-baseline next cycle)
        let newBaseline: Baseline | null = full ? null : baseline;
        if (full && complete && !healedAll) {
            const wf = lusakaDay(new Date(now - WINDOW_DAYS * DAY_MS).toISOString());
            newBaseline = { fullAt: new Date(now).toISOString(), windowFrom: wf, legacy: analysis.closing.unexplained,
                outside: Math.round(analysis.effects.filter(e => e.day < wf).reduce((a, e) => a + e.effect, 0) * 100) / 100 };
        }
        const health: Health = {
            status, checkedAt: new Date(now).toISOString(), mode, kind: full ? 'full' : 'incremental',
            closing: { ...analysis.closing, drift }, healed, baseline: newBaseline, stuck,
            issues: issues.slice(0, 40).map(i => ({ code: i.code, severity: i.severity, safe: i.safe, message: i.message, txnId: i.txnId, amount: i.amount })),
        };
        if (persist) await writeHealth(orgId, health);
        if (status === 'ATTENTION' || (actionable.length && !mayHeal)) {
            console.error(`[LedgerGuardian][${status}] ${org.name}: ${actionable.map(i => `${i.code}${i.amount !== undefined ? `(${i.amount})` : ''}`).join(', ')}`);
            captureEvent('ledger_guardian_attention', { feature: 'ledger_guardian', workflow_id: orgId, organization_id: orgId, user_id: 'system', status, issues: actionable.length });
        }
        if (healedAll) console.log(`[LedgerGuardian] ${org.name}: healed ${healed.map(h => h.detail).join('; ')}`);
        return { org: orgId, analysis, health };
    } catch (e: any) {
        const health = empty('ERROR', { error: String(e?.message ?? e).slice(0, 300) });
        console.error(`[LedgerGuardian] ${orgId.slice(0, 8)} check failed:`, e?.message);
        if (persist) await writeHealth(orgId, health).catch(() => undefined);
        return { org: orgId, health };
    } finally { if (persist) await releaseLock(orgId); }
}

/** Runs the guardian over several orgs within a time budget (used after each sync cycle). */
export async function runGuardianForOrgs(orgIds: string[], deadlineMs: number, opts: RunOptions = {}): Promise<RunResult[]> {
    const out: RunResult[] = [];
    for (const id of orgIds) {
        if (Date.now() > deadlineMs) break;
        out.push(await runOrgGuardian(id, opts));
    }
    return out;
}

// ───────────────────────────────────────── outflow booking claims ─────────────────────────────────────────────
// Inflows are protected by a unique index on external_reference; outflows are not, so the sync claims each new outflow with an
// insert-once marker (app_settings.key is unique). A claim older than 10 minutes with no ledger row behind it is a crashed run: retake it.

const CLAIM_KEY = (orgId: string, txnId: string) => `lenco_booked:${orgId}:${txnId}`;

export async function claimDebitBooking(orgId: string, txnId: string): Promise<boolean> {
    const key = CLAIM_KEY(orgId, txnId);
    const { error } = await supabase.from('app_settings').insert({ key, value: { at: new Date().toISOString() }, description: 'Lenco sync: this outflow has been (or is being) booked.', updated_at: new Date().toISOString() });
    if (!error) return true;
    const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
    const ageMs = Date.now() - Date.parse((data as any)?.value?.at ?? '');
    if (!(ageMs > 10 * 60_000)) return false;                                      // another run holds it (or booked it)
    const { data: row } = await supabase.from('cashbook_entries').select('id').eq('organization_id', orgId).eq('external_reference', txnId).limit(1);
    if (row && row.length) return false;                                           // it was booked after all
    await supabase.from('app_settings').upsert({ key, value: { at: new Date().toISOString(), retaken: true }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    return true;
}
export const releaseDebitClaim = (orgId: string, txnId: string) => supabase.from('app_settings').delete().eq('key', CLAIM_KEY(orgId, txnId)).then(() => undefined, () => undefined);

// ─────────────────────────────────────────── one cycle over many orgs ────────────────────────────────────────

/**
 * Cheap incremental passes for every org that has a fresh baseline, then — only if time remains — ONE full pass for the org whose
 * baseline is oldest (so baselines form and refresh daily without ever blowing the serverless time limit).
 */
export async function runGuardianCycle(orgIds: string[], deadlineMs: number, opts: RunOptions = {}): Promise<RunResult[]> {
    const out: RunResult[] = [];
    const needFull: Array<{ id: string; at: number }> = [];
    for (const id of orgIds) {
        if (deadlineMs - Date.now() < 9000) break;          // an incremental pass can take several seconds: never start one that could outlive the function
        const h = await readHealth(id).catch(() => null);
        const fullAt = h?.baseline ? Date.parse(h.baseline.fullAt) : 0;
        if (!h?.baseline || Date.now() - fullAt > FULL_PASS_MS) { needFull.push({ id, at: fullAt }); continue; }
        out.push(await runOrgGuardian(id, { ...opts, allowFull: false }));
    }
    needFull.sort((a, b) => a.at - b.at);
    if (needFull.length && deadlineMs - Date.now() > 25_000) out.push(await runOrgGuardian(needFull[0].id, { ...opts, full: true }));
    return out;
}

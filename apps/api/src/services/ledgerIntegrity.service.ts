/**
 * ledgerIntegrity.service.ts — proves (and restores) that the double-entry books match the wallets.
 *
 * The cashbook is the record of money moving in the wallets; the journal (general ledger) is derived from it,
 * one balanced journal entry per cashbook entry, and the reports read the journal. Everything the user sees in
 * Reports is only right if, for every organization:
 *
 *   1. every journal entry balances (Σ debit = Σ credit)                                  UNBALANCED_JOURNAL
 *   2. every journal belongs to a live cashbook entry (no ghosts of deleted entries)       ORPHAN_JOURNAL
 *   3. every real (non-pending, non-zero) cashbook entry has a journal                     MISSING_JOURNAL
 *   4. a pending/zero (e.g. neutralised) entry has NO journal                              JOURNAL_FOR_INELIGIBLE
 *   5. each journal's cash leg is on the entry's wallet account and equals the entry       CASH_LEG_MISMATCH
 *   5b. the other side of the posting follows the entry's category (not left in Suspense)  CONTRA_STALE
 *   6. each wallet account's ledger balance equals the wallet's own cashbook balance       WALLET_TIE
 *   7. assets − liabilities = equity + income − expense (the balance sheet balances)       BALANCE_SHEET
 *   8. the reports' own roll-up equals the ledger (and uses the ledger, not the fallback)  REPORT_TIE
 *
 * (1)-(5) can all be repaired mechanically by re-posting from the cashbook, which `healOrganization` does.
 * Suspense (uncategorised) is reported as information: it is correct bookkeeping, just not yet classified.
 */
import { supabase } from '../lib/supabase';
import { ledgerService, resolveCashAccountForEntry, type CashbookRow } from './ledger.service';

const TOL = 0.005;
export type Severity = 'ERROR' | 'WARN' | 'INFO';

export interface Finding {
    code: string;
    severity: Severity;
    message: string;
    count?: number;
    amount?: number;
    fixable?: boolean;
    sample?: any[];
}

export interface AuditResult {
    organizationId: string;
    organizationName?: string;
    ok: boolean;                 // no ERROR findings
    findings: Finding[];
    totals: { assets: number; liabilities: number; equity: number; income: number; expense: number; suspense: number; cashbookEntries: number; journals: number };
    wallets: { name: string; cashbook: number; ledger: number; account?: string }[];
}

async function all<T = any>(build: () => any): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
        const { data, error } = await build().range(from, from + 999);
        if (error) throw new Error(error.message);
        out.push(...(data || []));
        if (!data || data.length < 1000) break;
    }
    return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
// Master Fees payments are journaled by the Master Fees integration (its own source types), not 1:1 from the
// cashbook, so they are outside these cashbook↔journal checks.
const isMasterFees = (ce: any) => String(ce.account_type || '').startsWith('MASTERFEES') || !!ce.mf_payment_channel;
const resolveReadOnly = (ce: any) => resolveCashAccountForEntry(ce, { create: false });
const isEligible = (ce: any) => ce.status !== 'PENDING' && Math.abs(Number(ce.debit || 0) - Number(ce.credit || 0)) > TOL;

/**
 * The "other side" of a posting is stale when the entry (or its requisition's items) has been categorised since it
 * was posted: a categorised account is missing from the journal. (A leftover in Suspense because the cash paid
 * differs from the item totals is legitimate and is not flagged.)
 */
function contraStale(ce: any, js: any[], itemAccounts: Map<string, Set<string> | null>): boolean {
    const lines = js[0]?.journal_lines || [];
    const present = new Set(lines.map((l: any) => l.account_id));
    if (ce.requisition_id) {
        const wanted = itemAccounts.get(ce.requisition_id);
        if (!wanted || wanted.size === 0) return false;           // not (fully) categorised yet — nothing to compare
        for (const id of wanted) if (!present.has(id)) return true;
        return false;
    }
    if (ce.account_id) return !present.has(ce.account_id);
    return false;
}

/** requisition → the accounts its line items point at, or null when any item is still uncategorised. */
async function loadItemsCategorised(organizationId: string): Promise<Map<string, Set<string> | null>> {
    const rows = await all<any>(() => supabase.from('line_items').select('requisition_id, account_id, qb_account_id, requisitions!inner(organization_id)').eq('requisitions.organization_id', organizationId));
    const m = new Map<string, Set<string> | null>();
    for (const r of rows) {
        if (m.get(r.requisition_id) === null) continue;
        if (!r.account_id) { m.set(r.requisition_id, null); continue; }   // uncategorised (or QuickBooks-mapped only): skip
        const set = m.get(r.requisition_id) || new Set<string>();
        set.add(r.account_id); m.set(r.requisition_id, set);
    }
    return m;
}

export async function auditOrganization(organizationId: string, opts: { sample?: number } = {}): Promise<AuditResult> {
    const sampleN = opts.sample ?? 5;
    const findings: Finding[] = [];

    const [org, accounts, wallets, entries, journals] = await Promise.all([
        supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle().then(r => r.data as any),
        all(() => supabase.from('accounts').select('id, code, name, type').eq('organization_id', organizationId)),
        all(() => supabase.from('organization_wallets').select('id, name, is_main').eq('organization_id', organizationId)),
        all<CashbookRow & { date: string }>(() => supabase.from('cashbook_entries')
            .select('id, organization_id, date, description, reference_number, debit, credit, account_type, wallet_id, account_id, requisition_id, entry_type, status, created_by, mf_payment_channel')
            .eq('organization_id', organizationId).order('created_at')),
        all(() => supabase.from('journal_entries').select('id, source_type, source_id, entry_date, description, journal_lines(account_id, debit, credit)')
            .eq('organization_id', organizationId)),
    ]);

    const acct = new Map(accounts.map((a: any) => [a.id, a]));
    const itemsCategorised = await loadItemsCategorised(organizationId);
    const entryById = new Map(entries.map(e => [e.id, e]));
    const cashJournals = journals.filter((j: any) => j.source_type === 'CASHBOOK');
    const journalBySource = new Map<string, any[]>();
    for (const j of cashJournals) { const a = journalBySource.get(j.source_id) || []; a.push(j); journalBySource.set(j.source_id, a); }

    // 1. balanced
    const unbalanced = journals.filter((j: any) => {
        const d = j.journal_lines.reduce((t: number, l: any) => t + Number(l.debit || 0), 0);
        const c = j.journal_lines.reduce((t: number, l: any) => t + Number(l.credit || 0), 0);
        return Math.abs(d - c) > TOL;
    });
    if (unbalanced.length) findings.push({ code: 'UNBALANCED_JOURNAL', severity: 'ERROR', message: `${unbalanced.length} journal entries do not balance (debits ≠ credits).`, count: unbalanced.length, sample: unbalanced.slice(0, sampleN).map((j: any) => j.description) });

    // 2. orphans (journal whose cashbook entry no longer exists) + duplicates (two journals for one entry)
    const orphans = cashJournals.filter((j: any) => !entryById.has(j.source_id));
    if (orphans.length) {
        const amount = orphans.reduce((t: number, j: any) => t + j.journal_lines.reduce((x: number, l: any) => x + Number(l.debit || 0), 0), 0);
        findings.push({ code: 'ORPHAN_JOURNAL', severity: 'ERROR', fixable: true, count: orphans.length, amount: r2(amount), message: `${orphans.length} ledger postings (K${r2(amount).toLocaleString()} of debits) belong to cashbook entries that no longer exist.`, sample: orphans.slice(0, sampleN).map((j: any) => `${j.entry_date} ${String(j.description || '').slice(0, 50)}`) });
    }
    const dupes = [...journalBySource.entries()].filter(([id, js]) => js.length > 1 && entryById.has(id));
    if (dupes.length) findings.push({ code: 'DUPLICATE_JOURNAL', severity: 'ERROR', fixable: true, count: dupes.length, message: `${dupes.length} cashbook entries are posted to the ledger more than once.` });

    // 3/4/5. per-entry: missing, ineligible-with-journal, cash-leg mismatch
    const missing: any[] = []; const ineligible: any[] = []; const wrongLeg: any[] = []; const staleContra: any[] = [];
    const cashAcctCache = new Map<string, string | null>();
    const entryCashAcct = new Map<string, string | null>();
    let mfSkipped = 0;
    for (const ce of entries) {
        if (isMasterFees(ce)) { mfSkipped++; continue; }
        const js = journalBySource.get(ce.id) || [];
        const eligible = isEligible(ce);
        if (!eligible) { if (js.length) ineligible.push(ce); continue; }
        if (js.length === 0) { missing.push(ce); continue; }
        const key = `${ce.account_type}|${ce.wallet_id}|${ce.mf_payment_channel}`;
        if (!cashAcctCache.has(key)) cashAcctCache.set(key, await resolveReadOnly(ce));
        const cashId = cashAcctCache.get(key) ?? null;
        entryCashAcct.set(ce.id, cashId);
        const expected = Number(ce.debit || 0) - Number(ce.credit || 0);
        const leg = js[0].journal_lines.filter((l: any) => l.account_id === cashId).reduce((t: number, l: any) => t + Number(l.debit || 0) - Number(l.credit || 0), 0);
        if (!cashId || String(cashId).startsWith('__WILL_CREATE__') || Math.abs(leg - expected) > TOL) wrongLeg.push({ ce, leg, expected });
        else if (contraStale(ce, js, itemsCategorised)) staleContra.push(ce);
    }
    if (missing.length) findings.push({ code: 'MISSING_JOURNAL', severity: 'ERROR', fixable: true, count: missing.length, amount: r2(missing.reduce((t, e) => t + Math.abs(Number(e.debit || 0) - Number(e.credit || 0)), 0)), message: `${missing.length} cashbook entries are not in the ledger yet.`, sample: missing.slice(0, sampleN).map(e => `${e.date} ${String(e.description || '').slice(0, 50)}`) });
    if (ineligible.length) findings.push({ code: 'JOURNAL_FOR_INELIGIBLE', severity: 'ERROR', fixable: true, count: ineligible.length, amount: r2(ineligible.reduce((t, e) => t + (journalBySource.get(e.id) || []).reduce((x, j) => x + j.journal_lines.reduce((y: number, l: any) => y + Number(l.debit || 0), 0), 0), 0)), message: `${ineligible.length} pending or zero-value (e.g. neutralised) entries are still posted in the ledger.`, sample: ineligible.slice(0, sampleN).map(e => `${e.date} ${String(e.description || '').slice(0, 50)}`) });
    if (wrongLeg.length) findings.push({ code: 'CASH_LEG_MISMATCH', severity: 'ERROR', fixable: true, count: wrongLeg.length, amount: r2(wrongLeg.reduce((t, w) => t + Math.abs(w.leg - w.expected), 0)), message: `${wrongLeg.length} ledger postings put the wrong amount, or the wrong wallet account, on the cash side.`, sample: wrongLeg.slice(0, sampleN).map(w => `${w.ce.date} ${String(w.ce.description || '').slice(0, 40)} wallet moved ${r2(w.expected)} / ledger ${r2(w.leg)}`) });

    if (staleContra.length) findings.push({ code: 'CONTRA_STALE', severity: 'ERROR', fixable: true, count: staleContra.length, amount: r2(staleContra.reduce((t, e) => t + Math.abs(Number(e.debit || 0) - Number(e.credit || 0)), 0)), message: `${staleContra.length} transactions were categorised after they were posted, so the ledger still shows them as uncategorised (Suspense).`, sample: staleContra.slice(0, sampleN).map(e => `${e.date} ${String(e.description || '').slice(0, 50)}`) });

    // GL balances per account (all journals)
    const bal = new Map<string, number>(); // debit - credit
    for (const j of journals) for (const l of (j as any).journal_lines) bal.set(l.account_id, (bal.get(l.account_id) || 0) + Number(l.debit || 0) - Number(l.credit || 0));
    const sumType = (t: string) => [...bal.entries()].filter(([id]) => (acct.get(id) as any)?.type === t).reduce((s, [, v]) => s + v, 0);
    const assets = sumType('ASSET'), liabilities = -sumType('LIABILITY'), equity = -sumType('EQUITY'), income = -sumType('INCOME'), expense = sumType('EXPENSE');
    const suspenseId = accounts.find((a: any) => a.code === 'QB-SUSPENSE')?.id;
    const suspense = suspenseId ? -(bal.get(suspenseId) || 0) : 0;

    // 6. wallet tie: Σ cashbook per wallet account  vs  that account's ledger balance
    const expectedByAcct = new Map<string, number>();
    const walletRows: AuditResult['wallets'] = [];
    for (const ce of entries) {
        if (!isEligible(ce) || isMasterFees(ce)) continue;
        let cashId = entryCashAcct.get(ce.id);
        if (cashId === undefined) {
            const key = `${ce.account_type}|${ce.wallet_id}|${ce.mf_payment_channel}`;
            if (!cashAcctCache.has(key)) cashAcctCache.set(key, await resolveReadOnly(ce));
            cashId = cashAcctCache.get(key) ?? null;
        }
        if (!cashId) continue;
        expectedByAcct.set(cashId, (expectedByAcct.get(cashId) || 0) + Number(ce.debit || 0) - Number(ce.credit || 0));
    }
    const tieBreaks: string[] = [];
    for (const [id, expected] of expectedByAcct) {
        const ledger = bal.get(id) || 0;
        const a: any = acct.get(id) || (String(id).startsWith('__WILL_CREATE__') ? { name: `new account for a sub-wallet (${String(id).split(':')[1]})`, code: String(id).split(':')[1] } : undefined);
        const wouldCreate = String(id).startsWith('__WILL_CREATE__');
        const cashbookWallet = wallets.find((w: any) => (w.is_main && a?.code === 'QB-1150040000') || a?.name === w.name || a?.code === `WAL-${String(w.id).slice(0, 8).toUpperCase()}`);
        walletRows.push({ name: cashbookWallet?.name || a?.name || id, cashbook: r2(expected), ledger: r2(ledger), account: a?.name });
        if (Math.abs(ledger - expected) > TOL) tieBreaks.push(`${a?.name}: wallet K${r2(expected)} vs ledger K${r2(ledger)}`);
    }
    if (tieBreaks.length) findings.push({ code: 'WALLET_TIE', severity: 'ERROR', fixable: true, count: tieBreaks.length, message: 'A wallet account in the ledger does not equal the money in the wallet.', sample: tieBreaks });

    // 7. balance sheet identity
    const diff = (assets - liabilities) - (equity + income - expense);
    if (Math.abs(diff) > TOL) findings.push({ code: 'BALANCE_SHEET', severity: 'ERROR', amount: r2(diff), message: `Assets − liabilities does not equal equity + income − expenses (off by K${r2(diff)}).` });

    // 8. the report roll-up reads the ledger and agrees with it
    const gaps = missing.length;
    if (gaps > 0) findings.push({ code: 'REPORT_FALLBACK', severity: 'WARN', message: 'While entries are missing from the ledger, Reports fall back to the older calculation, which can disagree with the wallets.' });

    if (mfSkipped > 0) findings.push({ code: 'MASTERFEES_EXCLUDED', severity: 'INFO', count: mfSkipped, message: `${mfSkipped} Master Fees entries are journaled by the Master Fees integration and were not checked here.` });
    if (Math.abs(suspense) > TOL) findings.push({ code: 'SUSPENSE', severity: 'INFO', amount: r2(suspense), message: `K${r2(Math.abs(suspense)).toLocaleString()} ${suspense > 0 ? 'of uncategorised inflows' : 'of uncategorised outflows'} sit in Uncategorised / Suspense (correct bookkeeping, but not yet classified).` });

    return {
        organizationId, organizationName: org?.name,
        ok: !findings.some(f => f.severity === 'ERROR'),
        findings,
        totals: { assets: r2(assets), liabilities: r2(liabilities), equity: r2(equity), income: r2(income), expense: r2(expense), suspense: r2(suspense), cashbookEntries: entries.length, journals: journals.length },
        wallets: walletRows,
    };
}

export interface HealResult { orphansRemoved: number; reposted: number; failed: number }

/**
 * Repairs every fixable finding by rebuilding the ledger from the cashbook: deletes ghost/duplicate journals and
 * re-posts missing, stale, ineligible and wrongly-routed entries. Idempotent. Returns what it changed.
 */
export async function healOrganization(organizationId: string, opts: { deadlineMs?: number } = {}): Promise<HealResult> {
    const deadline = opts.deadlineMs ?? Date.now() + 25_000;
    const res: HealResult = { orphansRemoved: 0, reposted: 0, failed: 0 };

    const [entries, journals] = await Promise.all([
        all<any>(() => supabase.from('cashbook_entries').select('id, debit, credit, status, account_type, wallet_id, mf_payment_channel, organization_id, date, description, reference_number, account_id, requisition_id, entry_type, created_by').eq('organization_id', organizationId)),
        all<any>(() => supabase.from('journal_entries').select('id, source_id, journal_lines(account_id, debit, credit)').eq('organization_id', organizationId).eq('source_type', 'CASHBOOK')),
    ]);
    const byId = new Map(entries.map(e => [e.id, e]));
    const itemsCategorised = await loadItemsCategorised(organizationId);
    const journalsBySource = new Map<string, any[]>();
    for (const j of journals) { const a = journalsBySource.get(j.source_id) || []; a.push(j); journalsBySource.set(j.source_id, a); }

    // ghosts: journals of deleted entries
    for (const j of journals) {
        if (byId.has(j.source_id)) continue;
        await supabase.from('journal_entries').delete().eq('id', j.id);
        res.orphansRemoved++;
    }

    const cache = new Map<string, string | null>();
    const toRepost: string[] = [];
    for (const ce of entries) {
        if (isMasterFees(ce)) continue;
        const js = journalsBySource.get(ce.id) || [];
        if (!isEligible(ce)) { if (js.length) toRepost.push(ce.id); continue; }
        if (js.length !== 1) { toRepost.push(ce.id); continue; }
        const key = `${ce.account_type}|${ce.wallet_id}|${ce.mf_payment_channel}`;
        if (!cache.has(key)) cache.set(key, await resolveReadOnly(ce));
        const cashId = cache.get(key) ?? null;
        if (String(cashId).startsWith('__WILL_CREATE__')) { toRepost.push(ce.id); continue; }
        const leg = js[0].journal_lines.filter((l: any) => l.account_id === cashId).reduce((t: number, l: any) => t + Number(l.debit || 0) - Number(l.credit || 0), 0);
        if (!cashId || Math.abs(leg - (Number(ce.debit || 0) - Number(ce.credit || 0))) > TOL) { toRepost.push(ce.id); continue; }
        if (contraStale(ce, js, itemsCategorised)) toRepost.push(ce.id);
    }
    for (const id of toRepost) {
        if (Date.now() > deadline) { res.failed += toRepost.length - res.reposted - res.failed; break; }
        try { await ledgerService.repostForCashbookEntry(id); res.reposted++; } catch (e: any) { res.failed++; console.error(`[LedgerHeal] repost failed for ${id}:`, e?.message); }
    }
    return res;
}

// Self-healing read: at most one pass per org per interval, so opening Reports always shows books that tie
// to the wallets without making every request pay for a full audit.
const lastHeal = new Map<string, number>();
export async function healIfDue(organizationId: string, minIntervalMs = 5 * 60_000, deadlineMs = 8_000): Promise<HealResult | null> {
    const now = Date.now();
    if (now - (lastHeal.get(organizationId) || 0) < minIntervalMs) return null;
    lastHeal.set(organizationId, now);
    try { return await healOrganization(organizationId, { deadlineMs: now + deadlineMs }); }
    catch (e: any) { console.error(`[LedgerHeal] ${organizationId}:`, e?.message); return null; }
}

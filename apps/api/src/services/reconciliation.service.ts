/**
 * Financial Reconciliation Engine
 * ---------------------------------
 * Compares MoneyWise's own ledger (cashbook_entries in Supabase) against Lenco
 * (the bank / source of truth) for every organization linked to a Lenco sub-account.
 *
 * An org's wallets (Main + sub-wallets) all roll up to a SINGLE Lenco sub-account
 * (organizations.lenco_subaccount_id), so reconciliation is per-org across all of
 * that org's MONEYWISE_WALLET cashbook entries.
 *
 * Fee handling (mirrors apps/api/src/controllers/lenco.controller.ts sync):
 *  - Lenco debit `amount` EXCLUDES the per-transaction bank fee. The TRUE cash that
 *    left is the running-balance drop (`prevBalance - balance`) — the sync's `_gross`.
 *    The wallet ledger logs disbursements at this gross, so we compare on gross too;
 *    the embedded bank fee is surfaced separately as `bankFees`.
 *  - The MoneyWise platform-fee sweep ("Split payment" debit → Blue Opus) is NOT
 *    posted to the paying org's ledger. We exclude it from the comparable outflow and
 *    surface it separately as `platformFees` (MoneyWise commission from that org).
 *  - CHG- change-return credits are netting, not income — excluded from inflows.
 *  - failed / reversed transactions are ignored.
 *
 * The CLOSING BALANCE remains the authoritative reconciliation signal (tolerance K1).
 */

import { supabase } from '../lib/supabase';
import { LencoService } from './lenco.service';

export const RECON_TOLERANCE = 1.0;
const CACHE_TTL_MS = 60_000;
const MAX_LENCO_PAGES = 40;

export type ReconStatus =
    | 'RECONCILED'
    | 'MINOR_DRIFT'
    | 'OUT_OF_BALANCE'
    | 'NOT_LINKED'
    | 'NO_WALLET'
    | 'CHECKING'
    | 'ERROR';

export interface SectionRecon {
    moneywise: number;
    /** null when Lenco could not be reached this cycle — distinct from a genuine 0 balance. */
    lenco: number | null;
    /** moneywise - lenco; null when lenco is null. */
    difference: number | null;
}

export interface FeesBreakdown {
    /** Lenco per-transaction bank charges, embedded in debit balance-drops. */
    bankFees: number;
    /** MoneyWise platform commission swept out of this org ("Split payment" debits). */
    platformFees: number;
}

export interface OrgReconSummary {
    orgId: string;
    name: string;
    slug: string | null;
    linked: boolean;
    lencoSubaccountId: string | null;
    walletCount: number;
    inflows: SectionRecon | null;
    outflows: SectionRecon | null;
    closing: SectionRecon | null;
    fees: FeesBreakdown | null;
    status: ReconStatus;
    reconciliationPct: number | null;
    error?: string;
    lastCheckedAt: string;
}

interface MoneyWiseTotals {
    inflow: number;
    outflow: number;
    closing: number;
    entryCount: number;
}

interface LencoTotals {
    inflow: number;
    outflow: number;
    bankFees: number;
    platformFees: number;
    closing: number;
    txnCount: number;
}

interface OrgRow {
    id: string;
    name: string;
    slug: string | null;
    lenco_subaccount_id: string | null;
    lenco_secret_key: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const n = (v: any): number => {
    const x = typeof v === 'number' ? v : parseFloat(v ?? '0');
    return Number.isFinite(x) ? x : 0;
};

const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

/** The MoneyWise platform-fee sweep leg (debit → Blue Opus). Mirrors the sync filter. */
function isSweepDebit(narration: string, reference: string): boolean {
    const d = (narration || '').toLowerCase();
    const r = (reference || '').toUpperCase();
    return (
        d.includes('split payment') ||
        r.startsWith('SPLIT-') ||
        d.includes('split-inflow') ||
        d.includes('to blue opus software')
    );
}

async function getMoneyWiseTotals(orgId: string): Promise<MoneyWiseTotals> {
    const { data, error } = await supabase
        .from('cashbook_entries')
        .select('debit, credit, status')
        .eq('organization_id', orgId)
        .eq('account_type', 'MONEYWISE_WALLET');

    if (error) throw new Error(`cashbook query failed: ${error.message}`);

    let inflow = 0;
    let outflow = 0;
    let entryCount = 0;
    for (const r of data ?? []) {
        if (String((r as any).status ?? '').toUpperCase() === 'PENDING') continue;
        inflow += n((r as any).debit);
        outflow += n((r as any).credit);
        entryCount++;
    }
    return { inflow, outflow, closing: inflow - outflow, entryCount };
}

export interface LencoTxn {
    id: string;
    type: string; // 'credit' | 'debit'
    amount: number;
    /** True cash movement (debits: amount + bank fee, from the running-balance drop). */
    grossAmount: number;
    narration: string;
    datetime: string;
    status: string;
    reference: string;
    balance: number;
    isSweep: boolean;
    isChange: boolean;
}

function normalizeLencoTxn(raw: any): LencoTxn {
    const type = String(raw?.type || '').toLowerCase();
    const amount = n(raw?.amount);
    const narration = raw?.remarks || raw?.narration || raw?.description || '';
    const reference = (raw?.reference || raw?.clientReference || '').trim();
    return {
        id: raw?.id || raw?.transactionId || '',
        type,
        amount,
        grossAmount: amount, // refined after sorting (debits only)
        narration,
        datetime: raw?.datetime || raw?.completedAt || raw?.createdAt || '',
        status: String(raw?.status || '').toLowerCase(),
        reference,
        balance: n(raw?.balance),
        isSweep: type === 'debit' && isSweepDebit(narration, reference),
        isChange: type === 'credit' && reference.toUpperCase().startsWith('CHG-'),
    };
}

/**
 * Compute each debit's gross (cash that actually left) from the running balance,
 * exactly like the sync's `_gross`. A clamp rejects ordering artifacts: a "fee"
 * outside [0, max(K60, 3% of amount)] falls back to the stated amount.
 */
function applyGross(sorted: LencoTxn[]): void {
    for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i];
        if (t.type !== 'debit') continue;
        const prev = i > 0 ? sorted[i - 1].balance : null;
        const cur = t.balance;
        if (prev === null || !Number.isFinite(prev) || !Number.isFinite(cur)) continue;
        const gross = round2(prev - cur);
        const fee = gross - t.amount;
        const cap = Math.max(60, t.amount * 0.03);
        t.grossAmount = fee >= 0 && fee <= cap ? gross : t.amount;
    }
}

async function fetchAllLencoTransactions(accountId: string, secretKey?: string): Promise<LencoTxn[]> {
    const all: LencoTxn[] = [];
    for (let page = 1; page <= MAX_LENCO_PAGES; page++) {
        const resp: any = await LencoService.getAccountTransactions(accountId, { page }, secretKey);
        const batch: any[] = Array.isArray(resp?.data)
            ? resp.data
            : Array.isArray(resp?.data?.data)
                ? resp.data.data
                : Array.isArray(resp)
                    ? resp
                    : [];
        if (batch.length === 0) break;
        for (const t of batch) all.push(normalizeLencoTxn(t));

        const meta = resp?.meta || resp?.data?.meta;
        const lastPage = meta?.pagination?.lastPage ?? meta?.lastPage;
        if (typeof lastPage === 'number' && page >= lastPage) break;
    }
    // Oldest-first so running-balance deltas are correct.
    all.sort((a, b) => new Date(a.datetime || 0).getTime() - new Date(b.datetime || 0).getTime());
    applyGross(all);
    return all;
}

function lencoTotalsFromTxns(txns: LencoTxn[], availableBalance: number): LencoTotals {
    let inflow = 0;
    let outflow = 0;
    let bankFees = 0;
    let platformFees = 0;
    let active = 0;
    for (const t of txns) {
        if (t.status === 'failed' || t.status === 'reversed') continue;
        active++;
        if (t.type === 'credit') {
            if (t.isChange) continue; // netting, not income
            inflow += t.amount;
        } else if (t.type === 'debit') {
            if (t.isSweep) {
                platformFees += t.amount; // MoneyWise commission — not posted to this org's ledger
                continue;
            }
            outflow += t.grossAmount; // gross, mirrors how the wallet logs disbursements
            bankFees += Math.max(0, round2(t.grossAmount - t.amount));
        }
    }
    return {
        inflow: round2(inflow),
        outflow: round2(outflow),
        bankFees: round2(bankFees),
        platformFees: round2(platformFees),
        closing: round2(availableBalance),
        txnCount: active,
    };
}

/** Numeric on both sides — assignable to SectionRecon, but narrower so classify() can require non-null. */
type NumericSection = { moneywise: number; lenco: number; difference: number };

function section(moneywise: number, lenco: number): NumericSection {
    return { moneywise: round2(moneywise), lenco: round2(lenco), difference: round2(moneywise - lenco) };
}

/** Lenco side unknown this cycle (unreachable/misconfigured account) — NOT the same as a real 0 balance. */
function sectionMwOnly(moneywise: number): SectionRecon {
    return { moneywise: round2(moneywise), lenco: null, difference: null };
}

function classify(closing: NumericSection): { status: ReconStatus; pct: number } {
    const diff = Math.abs(closing.difference);
    if (diff < RECON_TOLERANCE) return { status: 'RECONCILED', pct: 100 };
    const base = Math.max(Math.abs(closing.lenco), Math.abs(closing.moneywise), 1);
    const pct = Math.max(0, Math.round((1 - diff / base) * 100));
    const status: ReconStatus = diff < base * 0.02 ? 'MINOR_DRIFT' : 'OUT_OF_BALANCE';
    return { status, pct };
}

// ---------------------------------------------------------------------------
// Per-org summary
// ---------------------------------------------------------------------------

async function buildOrgSummary(org: OrgRow): Promise<OrgReconSummary> {
    const lastCheckedAt = new Date().toISOString();
    const base: OrgReconSummary = {
        orgId: org.id,
        name: org.name,
        slug: org.slug,
        linked: !!org.lenco_subaccount_id,
        lencoSubaccountId: org.lenco_subaccount_id,
        walletCount: 0,
        inflows: null,
        outflows: null,
        closing: null,
        fees: null,
        status: 'NOT_LINKED',
        reconciliationPct: null,
        lastCheckedAt,
    };

    const { count: walletCount } = await supabase
        .from('organization_wallets')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id);
    base.walletCount = walletCount ?? 0;

    if (!org.lenco_subaccount_id) {
        try {
            const mw = await getMoneyWiseTotals(org.id);
            base.inflows = section(mw.inflow, 0);
            base.outflows = section(mw.outflow, 0);
            base.closing = section(mw.closing, 0);
        } catch { /* leave nulls */ }
        base.status = 'NOT_LINKED';
        return base;
    }

    // MoneyWise totals are independent of Lenco reachability — compute them first so
    // a Lenco outage or a misconfigured account (see incident note below) never blanks
    // out data we actually have. Previously any Lenco failure discarded MW figures too.
    let mw: MoneyWiseTotals;
    try {
        mw = await getMoneyWiseTotals(org.id);
    } catch (err: any) {
        base.status = 'ERROR';
        base.error = err?.message || 'Failed to read MoneyWise ledger';
        return base;
    }

    const secretKey = org.lenco_secret_key || undefined;

    // Fetch the balance FIRST, alone (not raced against the transactions call).
    //
    // Root cause (2026-07 incident, TAEMJA / Test Company 1): two orgs had
    // lenco_subaccount_id set to an internal wallet-pool LABEL ("MWC20012")
    // instead of the real Lenco account UUID — provisioning never validated it.
    // With both calls racing via Promise.all, whichever rejected first "won",
    // so the SAME misconfigured account showed different, confusing error text
    // on different refreshes ("Account was not found..." vs "Invalid accountId"
    // from the /transactions endpoint) — impossible to diagnose from the UI.
    // The balance error is Lenco's clearest, so it's now the single source of
    // truth for what gets shown.
    let balanceData: any;
    try {
        balanceData = await LencoService.getAccountBalance(org.lenco_subaccount_id, secretKey);
    } catch (err: any) {
        base.inflows = sectionMwOnly(mw.inflow);
        base.outflows = sectionMwOnly(mw.outflow);
        base.closing = sectionMwOnly(mw.closing);
        base.status = 'ERROR';
        base.error = err?.message || 'Failed to reach Lenco';
        return base;
    }

    const availableBalance = n(balanceData?.availableBalance ?? balanceData?.balance);

    try {
        const txns = await fetchAllLencoTransactions(org.lenco_subaccount_id, secretKey);
        const lenco = lencoTotalsFromTxns(txns, availableBalance);

        const closingSection = section(mw.closing, lenco.closing);
        base.inflows = section(mw.inflow, lenco.inflow);
        base.outflows = section(mw.outflow, lenco.outflow);
        base.closing = closingSection;
        base.fees = { bankFees: lenco.bankFees, platformFees: lenco.platformFees };

        const { status, pct } = classify(closingSection);
        base.status = status;
        base.reconciliationPct = pct;
    } catch (err: any) {
        // Balance succeeded but the transaction list didn't — the closing balance
        // (the authoritative reconciliation signal) is still known, so classify on
        // that; inflow/outflow detail is unavailable this cycle.
        const closingSection = section(mw.closing, availableBalance);
        base.inflows = sectionMwOnly(mw.inflow);
        base.outflows = sectionMwOnly(mw.outflow);
        base.closing = closingSection;

        const { status, pct } = classify(closingSection);
        base.status = status;
        base.reconciliationPct = pct;
        base.error = `Transaction detail unavailable: ${err?.message || 'unknown error'}`;
    }

    return base;
}

// ---------------------------------------------------------------------------
// Transaction-level drill-down
// ---------------------------------------------------------------------------

export type TxnMatchStatus = 'MATCHED' | 'MONEYWISE_ONLY' | 'LENCO_ONLY';
export type TxnCategory = 'NORMAL' | 'PLATFORM_FEE' | 'CHANGE_RETURN';

export interface ReconTxnRow {
    matchStatus: TxnMatchStatus;
    category: TxnCategory;
    direction: 'inflow' | 'outflow';
    date: string;
    description: string;
    reference: string | null;
    lencoId: string | null;
    moneywiseAmount: number | null;
    lencoAmount: number | null;
    /** Bank fee embedded in this debit (gross - stated amount), when applicable. */
    bankFee: number | null;
    difference: number;
    walletId: string | null;
    entryType: string | null;
    /** Lets the UI group batch payouts (e.g. payroll children) under one consolidated line. */
    requisitionId: string | null;
}

export interface OrgReconDetail extends OrgReconSummary {
    transactions: ReconTxnRow[];
    counts: { matched: number; moneywiseOnly: number; lencoOnly: number };
}

/**
 * Map Lenco settlement/transaction id → merchant reference (DEP-…) from the collections
 * API. The /transactions API does NOT expose the merchant reference, so collection sales
 * are recorded in our ledger under their DEP- reference, not the Lenco txn id. This map
 * bridges the two so those rows match (mirrors the periodic sync's settlement→ref map).
 */
async function fetchCollectionsRefMap(secretKey?: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
        for (let page = 1; page <= MAX_LENCO_PAGES; page++) {
            const resp: any = await LencoService.getCollections({ page }, secretKey);
            const batch: any[] = Array.isArray(resp?.data)
                ? resp.data
                : Array.isArray(resp?.data?.data)
                    ? resp.data.data
                    : [];
            if (batch.length === 0) break;
            let added = 0;
            for (const col of batch) {
                const settlementId = col?.settlement?.id;
                const ref = (col?.reference || '').trim();
                if (settlementId && ref && !map.has(settlementId)) {
                    map.set(settlementId, ref);
                    added++;
                }
            }
            if (added === 0) break; // page param ignored / repeating data
        }
    } catch {
        /* non-fatal — matching falls back to id-only */
    }
    return map;
}

async function buildOrgDetail(org: OrgRow): Promise<OrgReconDetail> {
    const summary = await buildOrgSummary(org);
    const rows: ReconTxnRow[] = [];

    if (org.lenco_subaccount_id && summary.status !== 'ERROR') {
      try {
        const secretKey = org.lenco_secret_key || undefined;

        const { data: entries } = await supabase
            .from('cashbook_entries')
            .select('id, date, description, debit, credit, external_reference, wallet_id, entry_type, status, requisition_id')
            .eq('organization_id', org.id)
            .eq('account_type', 'MONEYWISE_WALLET')
            .order('date', { ascending: false });

        const [txns, collectionsRef] = await Promise.all([
            fetchAllLencoTransactions(org.lenco_subaccount_id, secretKey),
            fetchCollectionsRefMap(secretKey),
        ]);

        const entryByRef = new Map<string, any>();
        for (const e of entries ?? []) {
            const ref = (e as any).external_reference;
            if (ref) entryByRef.set(ref, e);
        }

        // Find the ledger entry a Lenco txn corresponds to: first by exact Lenco id, then
        // by the merchant reference (DEP-…) it settled under (the collections bridge).
        const findEntry = (t: LencoTxn): any => {
            if (!t.id) return undefined;
            const direct = entryByRef.get(t.id);
            if (direct) return direct;
            const depRef = collectionsRef.get(t.id);
            return depRef ? entryByRef.get(depRef) : undefined;
        };

        const matchedEntryIds = new Set<string>();

        for (const t of txns) {
            if (t.status === 'failed' || t.status === 'reversed') continue;
            const e = findEntry(t);
            const direction: 'inflow' | 'outflow' = t.type === 'credit' ? 'inflow' : 'outflow';
            // For debits, compare on gross (= how the wallet logs it); surface the bank fee.
            const lencoValue = t.type === 'debit' ? t.grossAmount : t.amount;
            const bankFee = t.type === 'debit' && !t.isSweep ? round2(t.grossAmount - t.amount) : null;
            const category: TxnCategory = t.isSweep ? 'PLATFORM_FEE' : t.isChange ? 'CHANGE_RETURN' : 'NORMAL';

            if (e) {
                matchedEntryIds.add(e.id);
                const mwAmount = direction === 'inflow' ? n(e.debit) : n(e.credit);
                rows.push({
                    matchStatus: 'MATCHED',
                    category,
                    direction,
                    date: (t.datetime || e.date || '').split('T')[0],
                    description: e.description || t.narration,
                    reference: e.external_reference,
                    lencoId: t.id,
                    moneywiseAmount: round2(mwAmount),
                    lencoAmount: round2(lencoValue),
                    bankFee,
                    difference: round2(mwAmount - lencoValue),
                    walletId: e.wallet_id,
                    entryType: e.entry_type,
                    requisitionId: e.requisition_id ?? null,
                });
            } else {
                rows.push({
                    matchStatus: 'LENCO_ONLY',
                    category,
                    direction,
                    date: (t.datetime || '').split('T')[0],
                    description: t.narration,
                    reference: t.reference || null,
                    lencoId: t.id,
                    moneywiseAmount: null,
                    lencoAmount: round2(lencoValue),
                    bankFee,
                    difference: round2(-lencoValue),
                    walletId: null,
                    entryType: null,
                    requisitionId: null,
                });
            }
        }

        for (const e of entries ?? []) {
            if (matchedEntryIds.has((e as any).id)) continue;
            if (String((e as any).status ?? '').toUpperCase() === 'PENDING') continue;
            const debit = n((e as any).debit);
            const credit = n((e as any).credit);
            if (debit === 0 && credit === 0) continue;
            const direction: 'inflow' | 'outflow' = debit > 0 ? 'inflow' : 'outflow';
            const mwAmount = direction === 'inflow' ? debit : credit;
            rows.push({
                matchStatus: 'MONEYWISE_ONLY',
                category: 'NORMAL',
                direction,
                date: ((e as any).date || '').split('T')[0],
                description: (e as any).description || '',
                reference: (e as any).external_reference || null,
                lencoId: null,
                moneywiseAmount: round2(mwAmount),
                lencoAmount: null,
                bankFee: null,
                difference: round2(mwAmount),
                walletId: (e as any).wallet_id,
                entryType: (e as any).entry_type,
                requisitionId: (e as any).requisition_id ?? null,
            });
        }

        rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      } catch (err: any) {
          // A transient Lenco failure here shouldn't 500 the whole detail page —
          // summary-level figures (computed above, independently) are still valid.
          rows.length = 0;
          summary.error = `Transaction drill-down unavailable: ${err?.message || 'unknown error'}`;
      }
    }

    const counts = {
        matched: rows.filter((r) => r.matchStatus === 'MATCHED').length,
        moneywiseOnly: rows.filter((r) => r.matchStatus === 'MONEYWISE_ONLY').length,
        lencoOnly: rows.filter((r) => r.matchStatus === 'LENCO_ONLY').length,
    };

    return { ...summary, transactions: rows, counts };
}

// ---------------------------------------------------------------------------
// Public API (60s in-memory cache to avoid hammering Lenco)
// ---------------------------------------------------------------------------

let overviewCache: { at: number; data: OrgReconSummary[] } | null = null;

async function fetchOrgRows(): Promise<OrgRow[]> {
    const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, lenco_subaccount_id, lenco_secret_key')
        .order('name', { ascending: true });
    if (error) throw new Error(`organizations query failed: ${error.message}`);
    return (data ?? []) as OrgRow[];
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let cursor = 0;
    const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (cursor < items.length) {
            const idx = cursor++;
            results[idx] = await worker(items[idx]);
        }
    });
    await Promise.all(runners);
    return results;
}

export async function getReconciliationOverview(forceRefresh = false): Promise<OrgReconSummary[]> {
    if (!forceRefresh && overviewCache && Date.now() - overviewCache.at < CACHE_TTL_MS) {
        return overviewCache.data;
    }
    const orgs = await fetchOrgRows();
    const data = await mapWithConcurrency(orgs, 4, buildOrgSummary);
    overviewCache = { at: Date.now(), data };
    return data;
}

/**
 * Fast first-paint overview: MoneyWise (DB) side only, NO live Lenco calls.
 * Linked orgs are marked CHECKING so the dashboard can render instantly and then
 * fill in the live Lenco comparison from getReconciliationOverview() in a 2nd pass.
 */
export async function getQuickOverview(): Promise<OrgReconSummary[]> {
    const lastCheckedAt = new Date().toISOString();
    // 3 batched queries total (orgs + all wallet rows + all wallet cashbook rows),
    // aggregated in JS — no per-org round-trips, so first paint is fast.
    const [orgs, walletsRes, entriesRes] = await Promise.all([
        fetchOrgRows(),
        supabase.from('organization_wallets').select('organization_id'),
        supabase
            .from('cashbook_entries')
            .select('organization_id, debit, credit, status')
            .eq('account_type', 'MONEYWISE_WALLET')
            .limit(100000),
    ]);

    const walletCounts = new Map<string, number>();
    for (const w of walletsRes.data ?? []) {
        const id = (w as any).organization_id;
        walletCounts.set(id, (walletCounts.get(id) ?? 0) + 1);
    }

    const totals = new Map<string, { inflow: number; outflow: number }>();
    for (const r of entriesRes.data ?? []) {
        if (String((r as any).status ?? '').toUpperCase() === 'PENDING') continue;
        const id = (r as any).organization_id;
        const a = totals.get(id) ?? { inflow: 0, outflow: 0 };
        a.inflow += n((r as any).debit);
        a.outflow += n((r as any).credit);
        totals.set(id, a);
    }

    return orgs.map((org) => {
        const a = totals.get(org.id) ?? { inflow: 0, outflow: 0 };
        return {
            orgId: org.id,
            name: org.name,
            slug: org.slug,
            linked: !!org.lenco_subaccount_id,
            lencoSubaccountId: org.lenco_subaccount_id,
            walletCount: walletCounts.get(org.id) ?? 0,
            inflows: section(a.inflow, 0),
            outflows: section(a.outflow, 0),
            closing: section(a.inflow - a.outflow, 0),
            fees: null,
            status: org.lenco_subaccount_id ? 'CHECKING' : 'NOT_LINKED',
            reconciliationPct: null,
            lastCheckedAt,
        } as OrgReconSummary;
    });
}

export async function getOrgReconciliationDetail(orgId: string): Promise<OrgReconDetail | null> {
    const orgs = await fetchOrgRows();
    const org = orgs.find((o) => o.id === orgId);
    if (!org) return null;
    return buildOrgDetail(org);
}

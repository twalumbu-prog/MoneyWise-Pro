import axios from 'axios';
import { supabase } from '../lib/supabase';
import { ledgerService } from './ledger.service';
import { cashbookService } from './cashbook.service';
import { broadcastInvalidate } from '../lib/realtimeBroadcast';

/**
 * Master Fees integration.
 *
 * Master Fees is a sibling Blue Opus product for schools. It exposes a read-only
 * REST API of invoices, payments and balances. This service pulls that activity
 * into MoneyWise's double-entry GL on an ACCRUAL basis:
 *
 *   Invoice issued  →  Dr "Master Fees Receivables" (asset)   Cr school-fee income
 *                      (revenue recognised in P&L per fee category)
 *   Payment received → clears the receivable (Cr Master Fees Receivables).
 *
 * The subtlety is Lenco. MoneyWise's own periodic Lenco sync
 * (syncAllLencoTransactions) already ingests EVERY credit landing in an org's
 * linked `lenco_subaccount_id` as a generic cashbook inflow. So:
 *
 *   • SHARED Lenco account  — the fee payment is ALREADY in our books as an
 *     inflow. We must NOT post cash again; instead we RECLASSIFY that inflow's
 *     contra from Suspense → Master Fees Receivables (via ledgerService), which
 *     records the cash exactly once and clears the receivable.
 *   • SEPARATE Lenco account — MoneyWise never sees that cash, so we post it
 *     ourselves to a dedicated "Master Fees Collections (Lenco)" asset and clear
 *     the receivable.
 *
 * Every invoice/payment maps 1:1 to a GL journal (source_type='MASTERFEES') and
 * is tracked in `masterfees_records`, making re-sync idempotent and edits a
 * delete-and-rebuild — the same pattern as ledger.service.ts.
 */

const MF_ROOT = process.env.MASTERFEES_API_ROOT || 'https://dashboard.master-fees.com/api/v1';
const SOURCE_TYPE = 'MASTERFEES';
const TOLERANCE = 0.005;

// System account codes for Master Fees postings (namespaced so they never clash
// with imported QuickBooks / onboarding accounts).
const CODE_RECEIVABLE = 'QB-MF-AR';
const CODE_COLLECTIONS = 'QB-MF-CASH';
const CODE_MANUAL_COLLECTIONS = 'QB-MF-MANUAL';
// Channel-specific manual collection accounts — see ledger.service.ts for the
// routing side. Master Fees' `payment_method` field carries real channel
// granularity (confirmed live: Blue Opus Academy has 'bank', 'mobile_money'
// AND 'manual' side by side), so we split manually-recorded payments by
// channel instead of dumping them all into one undifferentiated bucket.
const CODE_MANUAL_COLLECTIONS_BANK = 'QB-MF-MANUAL-BANK';
const CODE_MANUAL_COLLECTIONS_MOBILE = 'QB-MF-MANUAL-MOBILE';
const CODE_MANUAL_COLLECTIONS_OTHER = 'QB-MF-MANUAL-OTHER';
const CODE_GENERIC_INCOME = 'QB-MF-INC-GENERAL';

/**
 * Classify a manual Master Fees payment into an accounting channel, and — when
 * it's a bank payment with a specific bank identified — down to that exact
 * bank. Master Fees added `account_name` alongside `payment_method` after our
 * feature request; for 'bank'-channel payments it's populated ~98% of the time
 * with a real bank slug (confirmed live: 'zanaco', 'absa', 'stanchart',
 * 'natsave', 'atlas_mara', 'izb'). When known, we post to a dedicated GL
 * account for that specific bank (e.g. "Master Fees Manual — Zanaco") instead
 * of one generic "Bank" bucket — this is the double-entry the org actually
 * wants: Dr <specific bank> / Cr Master Fees Receivables.
 *
 * `key` is what gets persisted to cashbook_entries.mf_payment_channel and is
 * the exact string ledger.service.ts's resolveCashAccount() parses back out
 * to pick the GL account — keep the two in sync if this format changes.
 */
type ManualChannel = 'BANK' | 'MOBILE' | 'OTHER';
interface ManualChannelInfo {
    bucket: ManualChannel;
    bankSlug?: string;      // e.g. 'zanaco' — sanitized, used to build the account code
    bankDisplay?: string;   // e.g. 'Zanaco' — used in account name / label text
    key: string;            // persisted value: 'BANK:zanaco' | 'BANK' | 'MOBILE' | 'OTHER'
}
// A few observed slugs get a nicer display name; anything else falls back to a
// generic title-case of the slug so new banks need no code change.
const BANK_DISPLAY_OVERRIDES: Record<string, string> = {
    zanaco: 'Zanaco', absa: 'ABSA', stanchart: 'Standard Chartered', natsave: 'Natsave',
    atlas_mara: 'Atlas Mara', izb: 'Indo Zambia Bank', fnb: 'FNB', bancabc: 'BancABC',
};
function prettifyBankSlug(slug: string): string {
    if (BANK_DISPLAY_OVERRIDES[slug]) return BANK_DISPLAY_OVERRIDES[slug];
    return slug.split(/[_\s-]+/).filter(Boolean).map(w => w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)).join(' ');
}
function classifyManualChannel(txn: { payment_method?: string; account_name?: string | null }): ManualChannelInfo {
    const pm = String(txn.payment_method || '').toLowerCase();
    if (pm.includes('bank')) {
        const raw = String(txn.account_name || '').trim().toLowerCase();
        // Guard against Master Fees' own data quirk (mobile-money slugs sometimes
        // land in account_name under payment_method='bank') — only treat it as a
        // real bank name if it doesn't look like a mobile money provider.
        const looksLikeMobile = /airtel|mtn|momo|mobile/.test(raw);
        if (raw && !looksLikeMobile) {
            const slug = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
            if (slug) return { bucket: 'BANK', bankSlug: slug, bankDisplay: prettifyBankSlug(slug), key: `BANK:${slug}` };
        }
        return { bucket: 'BANK', key: 'BANK' }; // bank channel, but no specific bank named
    }
    if (pm.includes('mobile') || pm.includes('airtel') || pm.includes('mtn') || pm.includes('momo')) {
        return { bucket: 'MOBILE', key: 'MOBILE' };
    }
    return { bucket: 'OTHER', key: 'OTHER' }; // 'manual', 'cash', or anything unrecognised
}
const manualChannelLabel = (c: ManualChannelInfo) =>
    c.bankDisplay || (c.bucket === 'BANK' ? 'Bank' : c.bucket === 'MOBILE' ? 'Mobile Money' : 'Cash/Other');
/** Derive the GL account code for a specific bank slug — must match ledger.service.ts. */
const codeForBank = (slug: string) => `QB-MF-MANUAL-BANK-${slug.replace(/[^a-z0-9]/g, '').slice(0, 24).toUpperCase()}`;
const codeForCategory = (categoryId: string) =>
    `QB-MF-INC-${String(categoryId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24).toUpperCase()}`;

// ─────────────────────────────────────────────────────────────────────────────
// Types (defensive — the MF API varies field names slightly across resources).
// ─────────────────────────────────────────────────────────────────────────────
export interface MasterFeesConfig {
    schoolId: string;
    publicKey: string;
    baseUrl?: string;                // full `.../school/{id}/data` override
    lencoMode?: 'shared' | 'separate';
    lencoModeOverridden?: boolean;
    receivableAccountId?: string;
    collectionsAccountId?: string;
    categoryMap?: Record<string, { accountId: string; name: string }>;
    schoolName?: string;
    lastSyncedAt?: string;
    lastSyncError?: string | null;
    /** True when the most recent sync hit Master Fees' undocumented 1000-row
     *  API cap — see MF_ROW_CAP. Persisted so the "connected" status banner can
     *  keep showing the warning even outside the moment of the sync itself. */
    lastSyncTruncated?: boolean;
}

interface MFStudent {
    student_id?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    grade?: string;
    admission_number?: string;
}
interface MFInvoiceItem { description?: string; amount?: number | string; fee_category_id?: string; category_id?: string; }
interface MFInvoice {
    invoice_id: string;
    invoice_number?: string;
    status?: string;
    date_issued?: string;
    due_date?: string;
    total_amount?: number | string;
    paid_amount?: number | string;
    balance_due?: number | string;
    student?: MFStudent;
    items?: MFInvoiceItem[];
}
interface MFTransaction {
    transaction_id: string;
    reference?: string;
    amount?: number | string;
    payment_method?: string;
    // Added by Master Fees after our pagination/channel-detail support request:
    // the specific bank name behind a 'bank'-channel manual payment (e.g.
    // 'zanaco', 'absa', 'stanchart') — null for other channels or when the
    // school didn't record one.
    account_name?: string | null;
    source_payment_method?: string | null;
    status?: string;
    completed_at?: string;
    invoice_id?: string;
    student?: MFStudent;
}
interface MFFeeCategory { id?: string; category_id?: string; name?: string; amount?: number | string; price?: number | string; }

const num = (v: any): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};
const dateOnly = (v?: string): string => (v ? String(v).slice(0, 10) : new Date().toISOString().slice(0, 10));
const catId = (c: MFFeeCategory | MFInvoiceItem): string | undefined =>
    (c as any).id || (c as any).category_id || (c as any).fee_category_id;

// ─────────────────────────────────────────────────────────────────────────────
// REST client
// ─────────────────────────────────────────────────────────────────────────────
export class MasterFeesClient {
    private base: string;
    constructor(private config: MasterFeesConfig) {
        this.base = (config.baseUrl || `${MF_ROOT}/school/${config.schoolId}/data`).replace(/\/$/, '');
    }

    private async get<T = any>(path: string): Promise<T> {
        try {
            const resp = await axios.get(`${this.base}/${path}`, {
                headers: {
                    'X-MF-Public-Key': this.config.publicKey,
                    'Content-Type': 'application/json',
                },
                timeout: 20000,
            });
            return resp.data;
        } catch (err: any) {
            const status = err.response?.status;
            const body = err.response?.data;
            if (status === 401) throw new Error('Master Fees rejected the public key (401). Check the key in the school API settings.');
            if (status === 403) throw new Error(body?.message || 'Master Fees API access is disabled. Enable the Endpoint Master Switch (and this resource) in the school API settings.');
            if (status === 404) throw new Error('Master Fees school not found (404). Check the School ID.');
            if (status === 405) throw new Error('Master Fees rejected the request method (405). Only GET is supported.');
            throw new Error(`Master Fees request failed${status ? ` (${status})` : ''}: ${body?.message || err.message}`);
        }
    }

    private list<T = any>(resp: any): T[] {
        const candidate = resp?.data ?? resp?.transactions ?? resp?.students ?? resp?.categories ?? resp;
        // A single-result response can arrive as a bare object rather than a one-item
        // array (observed on invoices' `items`); normalize the same way here.
        if (Array.isArray(candidate)) return candidate as T[];
        if (candidate && typeof candidate === 'object') return [candidate] as T[];
        return [];
    }

    /**
     * Walk `?page=1,2,3...` until Master Fees signals the end. Confirmed live
     * (2026-08-18, after their pagination fix): a page with fewer than 1000 rows
     * can still be a real page (not necessarily the last), and requesting one
     * page past the actual last page returns an HTTP error (500) rather than an
     * empty array. So: keep going on any non-empty page; treat a request error
     * as "end of data" ONLY once we've already got at least one good page —
     * a failure on page 1 itself is a real error (auth/network/etc.) and must
     * still propagate normally.
     *
     * MAX_PAGES is a sanity ceiling, not an expected limit — 200 pages would be
     * 200,000 rows, far beyond any school's real size; it exists only so a
     * pathological response (e.g. them always returning non-empty data with no
     * real end) can't loop forever.
     */
    private async getPaginated<T = any>(path: string): Promise<T[]> {
        const MAX_PAGES = 200;
        const results: T[] = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
            let resp: any;
            try {
                resp = await this.get(`${path}?page=${page}`);
            } catch (err) {
                if (page === 1) throw err; // real error — first page must succeed
                break; // subsequent-page failure = end of data (their pagination signal)
            }
            const batch = this.list<T>(resp);
            if (batch.length === 0) break;
            results.push(...batch);
            if (batch.length < 1000) break; // short page = last page (avoids one wasted round trip)
        }
        return results;
    }

    async getSchoolMeta(): Promise<{ school_name?: string }> {
        const resp = await this.get('invoices').catch(() => this.get('students'));
        return { school_name: resp?.school_name };
    }
    async getStudents(): Promise<MFStudent[]> { return this.list(await this.get('students')); }
    async getInvoices(): Promise<MFInvoice[]> { return this.getPaginated<MFInvoice>('invoices'); }
    async getTransactions(): Promise<MFTransaction[]> { return this.getPaginated<MFTransaction>('transactions'); }
    async getFeeCategories(): Promise<MFFeeCategory[]> { return this.list(await this.get('fee-categories')); }
    async getBalances(): Promise<any[]> { return this.list(await this.get('summary/balances')); }
    async getPaymentsSummary(): Promise<any> { return this.get('summary/payments'); }
    async ping(): Promise<{ school_name?: string; categories: MFFeeCategory[] }> {
        // Cheapest validation that also warms the category map.
        const categories = await this.getFeeCategories().catch(() => [] as MFFeeCategory[]);
        const meta = await this.getSchoolMeta().catch(() => ({} as any));
        return { school_name: meta.school_name, categories };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration config helpers
// ─────────────────────────────────────────────────────────────────────────────
async function getIntegrationRow(organizationId: string) {
    const { data } = await supabase
        .from('integrations')
        .select('id, config, updated_at, created_at')
        .eq('provider', SOURCE_TYPE)
        .eq('organization_id', organizationId)
        .maybeSingle();
    return data;
}

export async function getMasterFeesIntegration(organizationId: string): Promise<{ id: string; config: MasterFeesConfig } | null> {
    const row = await getIntegrationRow(organizationId);
    if (!row) return null;
    return { id: row.id, config: (row.config || {}) as MasterFeesConfig };
}

async function patchConfig(organizationId: string, patch: Partial<MasterFeesConfig>): Promise<MasterFeesConfig> {
    const row = await getIntegrationRow(organizationId);
    const merged = { ...((row?.config || {}) as MasterFeesConfig), ...patch };
    await supabase
        .from('integrations')
        .update({ config: merged, updated_at: new Date().toISOString() })
        .eq('provider', SOURCE_TYPE)
        .eq('organization_id', organizationId);
    return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync lock — the cron fires a new sync-all invocation every minute regardless
// of whether the previous one finished. Once a sync actually does real work
// (posting many journals) instead of dying instantly to a timeout, two
// concurrent invocations for the same org race on postJournal's
// delete-then-insert pattern: one process's freshly-inserted journal header
// gets deleted out from under it by the other before its lines insert,
// producing duplicate-key/FK errors on every tick (confirmed live,
// 2026-08-18). Claim a lock via an atomic conditional UPDATE (single-row
// UPDATE...WHERE is atomic in Postgres, no session-scoped advisory lock
// needed) before starting; a concurrent tick that can't claim it backs off
// immediately rather than racing. 120s staleness auto-releases a lock left by
// a killed/crashed instance without needing manual intervention.
// ─────────────────────────────────────────────────────────────────────────────
const SYNC_LOCK_STALE_MS = 120_000;

async function acquireSyncLock(integrationId: string): Promise<boolean> {
    const staleBefore = new Date(Date.now() - SYNC_LOCK_STALE_MS).toISOString();
    const { data, error } = await supabase
        .from('integrations')
        .update({ sync_lock_at: new Date().toISOString() })
        .eq('id', integrationId)
        .or(`sync_lock_at.is.null,sync_lock_at.lt.${staleBefore}`)
        .select('id');
    if (error) {
        // PGRST204 / "column ... does not exist" means PostgREST's schema cache
        // hasn't picked up the sync_lock_at column yet (observed live, 2026-08-18:
        // NOTIFY pgrst + a follow-up DDL both failed to make it propagate within
        // 8+ minutes on this project). That's an infra-cache staleness condition,
        // not a real conflict signal — failing closed on it means NO sync ever
        // runs at all, which is strictly worse than the race it's meant to
        // prevent (that race is confirmed self-healing: no orphaned journals
        // resulted from it). Fail OPEN only for this specific, identifiable
        // cache-staleness error; any other unexpected error still fails closed.
        const staleCache = error.code === 'PGRST204' || /does not exist/i.test(error.message || '');
        if (staleCache) {
            console.warn('[MasterFees] Sync lock column not yet visible to PostgREST (schema cache staleness) — proceeding without the lock this tick.');
            return true;
        }
        console.error('[MasterFees] Failed to check/acquire sync lock:', error.message);
        return false; // fail safe: don't sync if we can't verify exclusivity
    }
    return !!(data && data.length > 0);
}

async function releaseSyncLock(integrationId: string): Promise<void> {
    await supabase.from('integrations').update({ sync_lock_at: null }).eq('id', integrationId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Account provisioning (idempotent upsert into `accounts` by (code, org))
// ─────────────────────────────────────────────────────────────────────────────
async function getOrCreateAccount(
    organizationId: string,
    spec: { code: string; name: string; type: string; subtype: string; description: string }
): Promise<string> {
    const { data: existing } = await supabase
        .from('accounts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('code', spec.code)
        .maybeSingle();
    if (existing) return existing.id;

    const { data, error } = await supabase
        .from('accounts')
        .insert({ ...spec, organization_id: organizationId, is_active: true })
        .select('id')
        .single();
    if (error || !data) {
        // A concurrent sync may have created it between our read and insert.
        const { data: retry } = await supabase
            .from('accounts')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('code', spec.code)
            .maybeSingle();
        if (retry) return retry.id;
        throw new Error(`Failed to provision account ${spec.code}: ${error?.message}`);
    }
    return data.id;
}

async function getReceivableAccount(organizationId: string): Promise<string> {
    return getOrCreateAccount(organizationId, {
        code: CODE_RECEIVABLE,
        name: 'Master Fees Receivables',
        type: 'ASSET',
        subtype: 'Accounts Receivable',
        description: 'Outstanding school fees invoiced via Master Fees (invoiced less paid).',
    });
}

async function getCollectionsAccount(organizationId: string): Promise<string> {
    return getOrCreateAccount(organizationId, {
        code: CODE_COLLECTIONS,
        name: 'Master Fees Collections (Lenco)',
        type: 'ASSET',
        subtype: 'Bank',
        description: 'Fee collections received in a Lenco account separate from the MoneyWise wallet.',
    });
}

async function getManualCollectionsAccount(organizationId: string): Promise<string> {
    return getOrCreateAccount(organizationId, {
        code: CODE_MANUAL_COLLECTIONS,
        name: 'Master Fees Manual Collections',
        type: 'ASSET',
        subtype: 'Bank',
        description: 'School fee payments recorded manually in Master Fees (not processed through Lenco) — e.g. cash, bank or Airtel Money entered by staff. Legacy bucket for rows synced before per-channel accounts existed.',
    });
}

/**
 * Resolve (provisioning if needed) the GL account a manual payment's cash leg
 * should debit. When the specific bank is known (info.bankSlug set), that gets
 * its own dedicated account — e.g. "Master Fees Manual — Zanaco" — so the
 * balance sheet shows exactly which real-world bank account holds the cash,
 * not just a generic "Bank" bucket. Falls back to the channel-level bucket
 * when Master Fees didn't name a specific bank for this payment.
 */
async function getManualCollectionsAccountForChannel(organizationId: string, info: ManualChannelInfo): Promise<string> {
    if (info.bucket === 'BANK' && info.bankSlug) {
        return getOrCreateAccount(organizationId, {
            code: codeForBank(info.bankSlug),
            name: `Master Fees Manual — ${info.bankDisplay}`,
            type: 'ASSET',
            subtype: 'Bank',
            description: `School fee payments recorded manually in Master Fees via bank transfer/deposit into ${info.bankDisplay}.`,
        });
    }
    const spec = {
        BANK: { code: CODE_MANUAL_COLLECTIONS_BANK, name: 'Master Fees Manual Collections — Bank', description: 'School fee payments recorded manually in Master Fees via bank deposit/transfer (specific bank not identified by Master Fees).' },
        MOBILE: { code: CODE_MANUAL_COLLECTIONS_MOBILE, name: 'Master Fees Manual Collections — Mobile Money', description: 'School fee payments recorded manually in Master Fees via mobile money (Airtel/MTN).' },
        OTHER: { code: CODE_MANUAL_COLLECTIONS_OTHER, name: 'Master Fees Manual Collections — Cash/Other', description: 'School fee payments recorded manually in Master Fees with no specific bank/mobile channel given (cash, or unclassified).' },
    }[info.bucket];
    return getOrCreateAccount(organizationId, { ...spec, type: 'ASSET', subtype: 'Bank' });
}

/**
 * Resolve (creating if needed) the income account for a fee category and cache
 * the mapping in the integration config so the UI can show/edit it.
 */
async function getIncomeAccountForCategory(
    organizationId: string,
    config: MasterFeesConfig,
    category: { id?: string; name?: string } | null
): Promise<string> {
    const id = category ? catId(category as any) : undefined;
    const map = config.categoryMap || {};

    if (id && map[id]?.accountId) return map[id].accountId;

    const name = category?.name?.trim();
    const code = id ? codeForCategory(id) : CODE_GENERIC_INCOME;
    const accountId = await getOrCreateAccount(organizationId, {
        code,
        name: name ? `School Fees — ${name}` : 'School Fees Income',
        type: 'INCOME',
        subtype: 'Sales',
        description: 'School-fee revenue recognised from Master Fees invoices.',
    });

    if (id) {
        map[id] = { accountId, name: name || id };
        await patchConfig(organizationId, { categoryMap: map });
        config.categoryMap = map;
    }
    return accountId;
}

// ─────────────────────────────────────────────────────────────────────────────
// GL posting primitives (source_type = 'MASTERFEES')
// ─────────────────────────────────────────────────────────────────────────────
async function removeJournal(organizationId: string, sourceId: string): Promise<void> {
    await supabase
        .from('journal_entries')
        .delete()
        .eq('organization_id', organizationId)
        .eq('source_type', SOURCE_TYPE)
        .eq('source_id', sourceId);
}

/** Insert a balanced journal. Refuses to post if it does not balance. Returns journal id (or null when netted to nothing). */
async function postJournal(
    organizationId: string,
    opts: {
        sourceId: string;
        date: string;
        description: string;
        reference?: string;
        lines: { account_id: string; debit: number; credit: number }[];
    }
): Promise<string | null> {
    await removeJournal(organizationId, opts.sourceId);

    const lines = opts.lines
        .map(l => ({ account_id: l.account_id, debit: Number((l.debit || 0).toFixed(2)), credit: Number((l.credit || 0).toFixed(2)) }))
        .filter(l => l.debit > TOLERANCE || l.credit > TOLERANCE);

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (lines.length < 2 || Math.abs(totalDebit - totalCredit) > TOLERANCE) {
        if (lines.length === 0) return null; // nothing to post (e.g. voided invoice)
        console.error(`[MasterFees] Refusing to post unbalanced journal for ${opts.sourceId} (Dr ${totalDebit} Cr ${totalCredit}).`);
        return null;
    }

    const { data: je, error: jeErr } = await supabase
        .from('journal_entries')
        .insert({
            organization_id: organizationId,
            entry_date: opts.date,
            description: opts.description,
            reference_number: opts.reference || null,
            source_type: SOURCE_TYPE,
            source_id: opts.sourceId,
        })
        .select('id')
        .single();
    if (jeErr || !je) {
        console.error(`[MasterFees] Failed to insert journal header for ${opts.sourceId}:`, jeErr?.message);
        return null;
    }

    const { error: lineErr } = await supabase
        .from('journal_lines')
        .insert(lines.map(l => ({ journal_entry_id: je.id, ...l })));
    if (lineErr) {
        console.error(`[MasterFees] Failed to insert journal lines for ${opts.sourceId}:`, lineErr.message);
        await supabase.from('journal_entries').delete().eq('id', je.id);
        return null;
    }
    return je.id;
}

async function upsertRecord(organizationId: string, integrationId: string, rec: {
    record_type: 'INVOICE' | 'PAYMENT';
    mf_id: string;
    mf_reference?: string | null;
    mf_invoice_id?: string | null;
    student_name?: string | null;
    grade?: string | null;
    fee_category_id?: string | null;
    amount: number;
    mf_status?: string | null;
    journal_entry_id?: string | null;
    cashbook_entry_id?: string | null;
    external_reference?: string | null;
    raw?: any;
}) {
    await supabase
        .from('masterfees_records')
        .upsert({
            organization_id: organizationId,
            integration_id: integrationId,
            ...rec,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,record_type,mf_id' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Posting: invoices (revenue recognition + receivable)
// ─────────────────────────────────────────────────────────────────────────────
const VOID_STATUSES = new Set(['void', 'voided', 'cancelled', 'canceled', 'deleted', 'draft']);

type PriorInvoiceRecord = { amount: number | string | null; mf_status: string | null; journal_entry_id: string | null };
type PriorPaymentRecord = { amount: number | string | null; mf_status: string | null; journal_entry_id: string | null; cashbook_entry_id: string | null };

/**
 * Batch-preload every already-synced record of a given type for an org into a
 * single lookup map. Used instead of a per-row `.maybeSingle()` idempotency
 * check — for an org with thousands of already-synced rows, checking each one
 * individually is thousands of sequential DB round trips per sync, which is
 * what blew every sync past Vercel's function timeout (confirmed live on
 * Twalumbu: ~2,600 rows/sync, stuck for over a week because every invocation
 * died mid-loop before completing a single pass). One bulk query + in-memory
 * lookup makes a no-op pass over already-synced data effectively free.
 */
async function loadPriorRecords<T>(organizationId: string, recordType: 'INVOICE' | 'PAYMENT', columns: string): Promise<Map<string, T>> {
    const map = new Map<string, T>();
    // PostgREST caps an unbounded select at 1,000 rows by default. Both invoices
    // (2,371+) and payments (1,638+) on Twalumbu already exceed that, so a single
    // unpaged call here silently drops everything past row #1,000 — those rows
    // then look "never synced" on every pass, and for payments (which are backed
    // by a real UNIQUE constraint on cashbook_entries.external_reference) that
    // means re-attempting an INSERT for an already-synced row, which fails with
    // "duplicate key value violates uniq_cashbook_inflow_per_reference" against
    // its own pre-existing entry. Confirmed live 2026-08-19: every retry hit the
    // identical set of transaction_ids past the 1,000 mark. Page through in full.
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from('masterfees_records')
            .select(`mf_id, ${columns}`)
            .eq('organization_id', organizationId)
            .eq('record_type', recordType)
            .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const row of data || []) map.set((row as any).mf_id, row as any);
        if (!data || data.length < PAGE) break;
    }
    return map;
}

async function postInvoice(
    organizationId: string,
    integrationId: string,
    config: MasterFeesConfig,
    invoice: MFInvoice,
    categoriesByName: Map<string, MFFeeCategory>,
    priorMap: Map<string, PriorInvoiceRecord>
): Promise<'posted' | 'skipped' | 'voided'> {
    const total = num(invoice.total_amount);
    const studentName = invoice.student?.full_name || [invoice.student?.first_name, invoice.student?.last_name].filter(Boolean).join(' ');
    const voided = VOID_STATUSES.has(String(invoice.status || '').toLowerCase());

    // Idempotency: skip when nothing material (amount / void-state) changed since
    // last sync. `mf_status` is deliberately EXCLUDED from this comparison — an
    // invoice's status moves pending → partial → complete purely as payments
    // arrive, with no effect on the journal (still Dr AR / Cr Income for the same
    // total). Treating a status change as "material" forced a full delete+rebuild
    // of every affected invoice's journal on every sync pass; with ~2,500 invoices
    // and payments constantly flipping their statuses, that alone consumed the
    // entire per-call time budget before the payments loop ever ran — the
    // confirmed cause of Twalumbu's payment sync stalling at ~50% coverage
    // (3,095 MF transactions vs. 1,546 synced) while invoices kept re-posting for
    // nothing. Status is still recorded — just via a cheap field update below,
    // not a journal rebuild.
    const prior = priorMap.get(invoice.invoice_id);
    if (prior && Math.abs(num(prior.amount) - total) < TOLERANCE && !!prior.journal_entry_id === !voided) {
        if ((prior.mf_status || '') !== (invoice.status || '')) {
            await supabase
                .from('masterfees_records')
                .update({ mf_status: invoice.status, synced_at: new Date().toISOString() })
                .eq('organization_id', organizationId)
                .eq('record_type', 'INVOICE')
                .eq('mf_id', invoice.invoice_id);
        }
        return 'skipped';
    }

    if (voided || total <= 0) {
        await removeJournal(organizationId, invoice.invoice_id);
        await upsertRecord(organizationId, integrationId, {
            record_type: 'INVOICE', mf_id: invoice.invoice_id, mf_reference: invoice.invoice_number,
            student_name: studentName, grade: invoice.student?.grade, amount: total, mf_status: invoice.status,
            journal_entry_id: null, raw: invoice,
        });
        return 'voided';
    }

    const receivableId = config.receivableAccountId || await getReceivableAccount(organizationId);

    // Credit income, split per fee category. Match each line item to a category by
    // explicit id, else by a case-insensitive substring of its description.
    // The API returns `items` as an array when an invoice has multiple line items,
    // but as a bare object (not array-wrapped) when it has exactly one — normalize
    // both shapes so a single-item invoice doesn't throw "not iterable".
    const rawItems = invoice.items;
    const items: MFInvoiceItem[] = Array.isArray(rawItems)
        ? rawItems
        : (rawItems && typeof rawItems === 'object' ? [rawItems as MFInvoiceItem] : []);
    const incomeByAccount = new Map<string, number>();
    let allocated = 0;
    for (const item of items) {
        const amt = num(item.amount);
        if (amt <= 0) continue;
        let category: MFFeeCategory | null = null;
        const explicit = catId(item);
        if (explicit) category = { id: explicit, name: undefined } as MFFeeCategory;
        else {
            const desc = String(item.description || '').toLowerCase();
            for (const [nm, c] of categoriesByName) if (nm && desc.includes(nm)) { category = c; break; }
        }
        const acct = await getIncomeAccountForCategory(organizationId, config, category);
        incomeByAccount.set(acct, (incomeByAccount.get(acct) || 0) + amt);
        allocated += amt;
    }
    // Any unallocated remainder (no items, or items that don't sum to the total)
    // goes to the generic school-fees income account so the journal balances.
    const remainder = Number((total - allocated).toFixed(2));
    if (remainder > TOLERANCE || incomeByAccount.size === 0) {
        const generic = await getIncomeAccountForCategory(organizationId, config, null);
        incomeByAccount.set(generic, (incomeByAccount.get(generic) || 0) + Math.max(remainder, incomeByAccount.size === 0 ? total : 0));
    }

    const lines = [
        { account_id: receivableId, debit: total, credit: 0 },
        ...Array.from(incomeByAccount.entries()).map(([account_id, amt]) => ({ account_id, debit: 0, credit: amt })),
    ];

    const journalId = await postJournal(organizationId, {
        sourceId: invoice.invoice_id,
        date: dateOnly(invoice.date_issued),
        description: `Master Fees Invoice ${invoice.invoice_number || invoice.invoice_id.slice(0, 8)}${studentName ? ` — ${studentName}` : ''}`,
        reference: invoice.invoice_number,
        lines,
    });

    await upsertRecord(organizationId, integrationId, {
        record_type: 'INVOICE', mf_id: invoice.invoice_id, mf_reference: invoice.invoice_number,
        student_name: studentName, grade: invoice.student?.grade, amount: total, mf_status: invoice.status,
        journal_entry_id: journalId, raw: invoice,
    });
    return 'posted';
}

// ─────────────────────────────────────────────────────────────────────────────
// Posting: payments (clear the receivable — never double-count cash)
// ─────────────────────────────────────────────────────────────────────────────

/** Find a MoneyWise cashbook INFLOW that already represents this Master Fees payment. */
async function findExistingInflow(organizationId: string, reference?: string): Promise<any | null> {
    if (!reference) return null;
    const ref = reference.trim();
    const { data } = await supabase
        .from('cashbook_entries')
        .select('id, account_id, external_reference, description, wallet_id, status, debit')
        .eq('organization_id', organizationId)
        .eq('entry_type', 'INFLOW')
        .or(`external_reference.eq.${ref},description.ilike.%${ref}%`)
        .limit(1)
        .maybeSingle();
    return data || null;
}

// `payment_method` is NOT a reliable Lenco-vs-manual signal — verified against real
// data: transactions with an obviously staff-typed reference report payment_method
// as 'bank'/'mobile_money' just as often as 'manual' (it only describes which
// channel the parent supposedly used, not who recorded the payment). The reliable
// signal is the reference format itself. A genuine Lenco-processed collection gets
// an auto-generated "REF-<epoch-timestamp>-<n>" reference — pure numbers, nothing
// human-readable. Every other format seen is staff-constructed: "MAN-<timestamp>-
// <n>" and "SPLIT-<...>" from the manual "record payment" form, and "BNK-<name>-
// <n>" where <name> is literally the first 3 letters of the student's first name
// (e.g. "BNK-CHR-265252" for Chris Tembo) — a human typed that, a webhook wouldn't.
// Whitelist rather than blacklist: only the unambiguous REF- format counts as Lenco.
function isLencoProcessed(txn: MFTransaction): boolean {
    return String(txn.reference || '').toUpperCase().startsWith('REF-');
}

async function postPayment(
    organizationId: string,
    integrationId: string,
    config: MasterFeesConfig,
    txn: MFTransaction,
    priorMap: Map<string, PriorPaymentRecord>
): Promise<'posted' | 'reclassified' | 'deferred' | 'skipped'> {
    const amount = num(txn.amount);
    if (amount <= 0) return 'skipped';
    const studentName = txn.student?.full_name || [txn.student?.first_name, txn.student?.last_name].filter(Boolean).join(' ');
    const status = String(txn.status || '').toLowerCase();
    if (status && !['completed', 'complete', 'success', 'successful', 'paid'].includes(status)) return 'skipped';

    const prior = priorMap.get(txn.transaction_id);
    const unchanged = prior && Math.abs(num(prior.amount) - amount) < TOLERANCE;

    // Manual payment amount was edited in Master Fees — update the existing cashbook
    // row in place and re-derive its journal. Lenco payments cannot be edited at
    // source (they are gateway-authoritative), so we only handle this for manual ones.
    if (!unchanged && prior?.cashbook_entry_id && !isLencoProcessed(txn)) {
        const channel = classifyManualChannel(txn);
        await getManualCollectionsAccountForChannel(organizationId, channel);
        await supabase
            .from('cashbook_entries')
            .update({ debit: amount, mf_payment_channel: channel.key })
            .eq('id', prior.cashbook_entry_id);
        await ledgerService.repostForCashbookEntry(prior.cashbook_entry_id);
        const { data: ce } = await supabase
            .from('cashbook_entries')
            .select('date, created_at, account_type')
            .eq('id', prior.cashbook_entry_id)
            .maybeSingle();
        if (ce) {
            await cashbookService.recalculateBalancesFrom(organizationId, ce.date, ce.created_at, ce.account_type);
        }
        await upsertRecord(organizationId, integrationId, {
            record_type: 'PAYMENT', mf_id: txn.transaction_id, mf_reference: txn.reference, mf_invoice_id: txn.invoice_id,
            student_name: studentName, grade: txn.student?.grade, amount, mf_status: txn.status,
            journal_entry_id: null, cashbook_entry_id: prior.cashbook_entry_id, external_reference: txn.reference, raw: txn,
        });
        return 'posted';
    }

    // Already visible as a cashbook inflow (current posting path) and unchanged.
    if (unchanged && prior!.cashbook_entry_id) {
        // A payment synced before payment_method-based routing existed may be
        // parked in the wrong bucket (a 'manual' Master Fees payment posted to the
        // Lenco-separate MASTERFEES account instead of MASTERFEES_MANUAL). Fix the
        // account_type in place and let ledgerService re-derive the journal — never
        // touches a shared-mode reclassified real wallet row (account_type stays
        // whatever the wallet's own sync gave it, e.g. MONEYWISE_WALLET).
        const desiredType = isLencoProcessed(txn) ? 'MASTERFEES' : 'MASTERFEES_MANUAL';
        const { data: ce } = await supabase
            .from('cashbook_entries')
            .select('account_type, date, created_at, mf_payment_channel')
            .eq('id', prior!.cashbook_entry_id)
            .maybeSingle();
        if (ce && (ce.account_type === 'MASTERFEES' || ce.account_type === 'MASTERFEES_MANUAL') && ce.account_type !== desiredType) {
            const oldType = ce.account_type;
            if (desiredType === 'MASTERFEES_MANUAL') await getManualCollectionsAccount(organizationId);
            else await getCollectionsAccount(organizationId);
            await supabase.from('cashbook_entries').update({ account_type: desiredType }).eq('id', prior!.cashbook_entry_id);
            await ledgerService.repostForCashbookEntry(prior!.cashbook_entry_id);
            // Moving an entry between buckets leaves BOTH running-balance chains
            // stale from that point forward (the old one has a gap, the new one has
            // an unaccounted-for jump) — repostForCashbookEntry only fixes the GL
            // journal, not cashbook_entries.balance_after. Recompute both in full.
            await cashbookService.recalculateBalancesFrom(organizationId, ce.date, ce.created_at, oldType);
            await cashbookService.recalculateBalancesFrom(organizationId, ce.date, ce.created_at, desiredType);
        } else if (ce && ce.account_type === 'MASTERFEES_MANUAL' && !isLencoProcessed(txn) && (!ce.mf_payment_channel || ce.mf_payment_channel === 'BANK')) {
            // Bucket already correct, but this row either predates per-channel
            // routing (null) or predates per-bank routing (generic 'BANK', from
            // before Master Fees started returning account_name) — tag/upgrade
            // and repost it in place so it moves onto its specific bank's account
            // (or the channel bucket, if still no specific bank is known).
            const channel = classifyManualChannel(txn);
            if (channel.key !== ce.mf_payment_channel) {
                await getManualCollectionsAccountForChannel(organizationId, channel);
                await supabase.from('cashbook_entries').update({ mf_payment_channel: channel.key }).eq('id', prior!.cashbook_entry_id);
                await ledgerService.repostForCashbookEntry(prior!.cashbook_entry_id);
            }
        }
        return 'skipped';
    }
    // A payment posted by an EARLIER version of this integration that wrote a journal
    // directly (source_type='MASTERFEES') without a cashbook_entries row — invisible
    // in Inbox → Inflows. Clean up the orphaned journal so the code below can
    // re-post it the current way (as a real cashbook inflow); ledgerService will
    // derive an equivalent replacement journal from that new row.
    const needsBackfill = unchanged && prior!.journal_entry_id && !prior!.cashbook_entry_id;
    if (needsBackfill) {
        await removeJournal(organizationId, txn.transaction_id);
    }

    const receivableId = config.receivableAccountId || await getReceivableAccount(organizationId);
    const label = `Master Fees Payment ${txn.reference || txn.transaction_id.slice(0, 8)}${studentName ? ` — ${studentName}` : ''}`;

    // ── Not processed through Lenco (staff entered it manually in Master Fees) ──
    // There is no chance MoneyWise's own Lenco sync ever saw this cash, so it
    // always needs posting ourselves, regardless of the org's Lenco mode —
    // "shared vs separate" is a Lenco-account concept and doesn't apply here.
    if (!isLencoProcessed(txn)) {
        const channel = classifyManualChannel(txn);
        await getManualCollectionsAccountForChannel(organizationId, channel); // ensure the contra-resolvable account exists
        const manualLabel = `Master Fees Manual Payment (${manualChannelLabel(channel)}) ${txn.reference || txn.transaction_id.slice(0, 8)}${studentName ? ` — ${studentName}` : ''}`;
        const entry = await cashbookService.createEntry(organizationId, {
            date: dateOnly(txn.completed_at),
            description: manualLabel,
            debit: amount,
            credit: 0,
            entry_type: 'INFLOW',
            status: 'COMPLETED',
            account_type: 'MASTERFEES_MANUAL',
            account_id: receivableId,
            external_reference: txn.reference || txn.transaction_id,
            mf_payment_channel: channel.key,
            skip_inflow_notification: needsBackfill,
            sender_name: studentName || null,
        } as any);
        await upsertRecord(organizationId, integrationId, {
            record_type: 'PAYMENT', mf_id: txn.transaction_id, mf_reference: txn.reference, mf_invoice_id: txn.invoice_id,
            student_name: studentName, grade: txn.student?.grade, amount, mf_status: txn.status,
            journal_entry_id: null, cashbook_entry_id: entry.id, external_reference: txn.reference, raw: txn,
        });
        return 'posted';
    }

    // ── Lenco-processed (bank / mobile money) — the shared-vs-separate account question applies ──
    const existingInflow = await findExistingInflow(organizationId, txn.reference);
    const shared = config.lencoMode === 'shared' || !!existingInflow;

    if (shared) {
        if (!existingInflow) {
            // Shared account but MoneyWise's Lenco sync hasn't ingested this credit
            // yet. Posting cash now would double-count once it arrives. Defer: record
            // the payment without a journal; the next sync cycle will reclassify the
            // inflow once it exists (both syncs run ~5 min).
            await upsertRecord(organizationId, integrationId, {
                record_type: 'PAYMENT', mf_id: txn.transaction_id, mf_reference: txn.reference, mf_invoice_id: txn.invoice_id,
                student_name: studentName, grade: txn.student?.grade, amount, mf_status: txn.status,
                journal_entry_id: null, cashbook_entry_id: null, external_reference: txn.reference, raw: txn,
            });
            return 'deferred';
        }
        // Reclassify the existing inflow's contra from Suspense → Receivable, and
        // relabel its description so it's identifiable as Master Fees revenue in
        // Inbox → Inflows (the account_type/wallet stays as-is — it's genuinely the
        // same MoneyWise wallet, not a separate cash bucket). Re-posting makes the
        // derived journal Dr Wallet / Cr Receivable, recording the cash once.
        if (existingInflow.account_id !== receivableId || existingInflow.description !== label) {
            await supabase
                .from('cashbook_entries')
                .update({ account_id: receivableId, status: 'ACCOUNTED', description: label })
                .eq('id', existingInflow.id);
            await ledgerService.repostForCashbookEntry(existingInflow.id);
        }
        await upsertRecord(organizationId, integrationId, {
            record_type: 'PAYMENT', mf_id: txn.transaction_id, mf_reference: txn.reference, mf_invoice_id: txn.invoice_id,
            student_name: studentName, grade: txn.student?.grade, amount, mf_status: txn.status,
            journal_entry_id: null, cashbook_entry_id: existingInflow.id, external_reference: txn.reference, raw: txn,
        });
        return 'reclassified';
    }

    // Separate Lenco account — MoneyWise's own Lenco sync never sees this cash, so
    // record it ourselves as a normal cashbook INFLOW (account_type='MASTERFEES',
    // labelled "Master Fees" in Inbox → Inflows) with the receivable as its contra
    // account. cashbookService.createEntry drives the existing ledgerService engine,
    // which derives the balanced journal (Dr Master Fees Collections / Cr
    // Receivable) automatically — same mechanism every other real cash movement uses.
    await getCollectionsAccount(organizationId); // ensure the contra-resolvable account exists
    const entry = await cashbookService.createEntry(organizationId, {
        date: dateOnly(txn.completed_at),
        description: label,
        debit: amount,
        credit: 0,
        entry_type: 'INFLOW',
        status: 'COMPLETED',
        account_type: 'MASTERFEES',
        account_id: receivableId,
        external_reference: txn.reference || txn.transaction_id,
        // Backfilling a payment an earlier version already posted (directly to the
        // GL, invisibly) is not new money arriving — don't re-notify admins about
        // history. Genuinely new payments still get the normal "New Inflow" email.
        skip_inflow_notification: needsBackfill,
        sender_name: studentName || null,
    } as any);
    await upsertRecord(organizationId, integrationId, {
        record_type: 'PAYMENT', mf_id: txn.transaction_id, mf_reference: txn.reference, mf_invoice_id: txn.invoice_id,
        student_name: studentName, grade: txn.student?.grade, amount, mf_status: txn.status,
        journal_entry_id: null, cashbook_entry_id: entry.id, external_reference: txn.reference, raw: txn,
    });
    return 'posted';
}

// ─────────────────────────────────────────────────────────────────────────────
// Lenco-mode auto-detection
// ─────────────────────────────────────────────────────────────────────────────
export async function detectLencoMode(organizationId: string, client: MasterFeesClient): Promise<'shared' | 'separate'> {
    // No linked Lenco subaccount at all → MoneyWise can't be seeing MF's cash.
    const { data: org } = await supabase
        .from('organizations')
        .select('lenco_subaccount_id')
        .eq('id', organizationId)
        .maybeSingle();
    if (!org?.lenco_subaccount_id) return 'separate';

    // Heuristic: if any recent MF payment reference already matches an existing
    // MoneyWise inflow, the two products share the Lenco account.
    try {
        const txns = (await client.getTransactions()).filter(t => (t.payment_method || '').toLowerCase() === 'lenco');
        for (const t of txns.slice(0, 25)) {
            if (await findExistingInflow(organizationId, t.reference)) return 'shared';
        }
    } catch { /* fall through to default */ }
    return 'separate';
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync orchestration
// ─────────────────────────────────────────────────────────────────────────────
// Master Fees originally capped invoices/transactions/ledger at exactly 1000
// rows per call with no pagination — fixed on their side 2026-08 (confirmed
// live: ?page=N now returns real, distinct pages; MasterFeesClient.getPaginated
// walks all of them). This constant now only guards the client's MAX_PAGES
// safety ceiling (200 pages = 200,000 rows) — hitting it would mean either a
// school with a genuinely enormous record count, or their pagination not
// terminating as expected; either way it's worth surfacing rather than
// silently truncating again.
const MF_ROW_CAP = 200_000;

export interface SyncSummary {
    invoices: { posted: number; skipped: number; voided: number };
    payments: { posted: number; reclassified: number; deferred: number; skipped: number };
    errors: string[];
    /** True when invoices and/or transactions hit the pagination safety
     *  ceiling this sync — see MF_ROW_CAP. Should be rare/never in practice
     *  now that Master Fees' pagination works. */
    truncated: boolean;
}

/**
 * @param deadline  Wall-clock time (ms since epoch) past which this call should
 *   stop starting new work and return, leaving the rest for the next cron tick.
 *   Each already-posted record is committed immediately (not batched in one
 *   transaction), so stopping early is safe — nothing is left half-written, and
 *   the batch-preloaded priorMap makes the next tick's re-pass over already-done
 *   rows cheap. Defaults to 35s from now, leaving headroom under Vercel's
 *   45s function timeout for the fee-category + invoice/transaction fetches
 *   that happen before either loop starts.
 */
export async function syncMasterfees(organizationId: string, deadline: number = Date.now() + 35_000): Promise<SyncSummary> {
    const integration = await getMasterFeesIntegration(organizationId);
    if (!integration) throw new Error('Master Fees is not connected for this organization.');

    if (!(await acquireSyncLock(integration.id))) {
        return {
            invoices: { posted: 0, skipped: 0, voided: 0 },
            payments: { posted: 0, reclassified: 0, deferred: 0, skipped: 0 },
            errors: ['Skipped — a sync for this org is already in progress (concurrent cron tick).'],
            truncated: false,
        };
    }

    try {
        return await runMasterfeesSync(organizationId, integration, deadline);
    } finally {
        await releaseSyncLock(integration.id);
    }
}

/**
 * Payments-only sync, with an optional "just the gap" filter.
 *
 * The full sync walks invoices before payments (invoices create the receivable
 * payments clear, so that order matters on a cold start). But the MF feed comes
 * back in a stable order, so on a school with a large backlog every pass re-walks
 * the same already-synced invoices from the top and the time budget is gone
 * before the payments loop is reached — payments then never converge. Twalumbu
 * sat at 1,546 of 3,095 transactions this way while its invoices were 95% done.
 *
 * Once invoices are substantially posted, the receivables those payments need
 * already exist, so the invoice phase is pure overhead. This entry point skips it
 * and — with `onlyMissing` — diffs the MF feed against masterfees_records first,
 * so we only spend the budget on transactions we have never posted rather than
 * re-deciding "skip" for thousands we already have.
 *
 * `onlyMissing` deliberately matches on presence, not content: it will not pick
 * up an amount edit to an already-synced payment. That is what the full sync is
 * for. Use this to close a gap, not as a replacement for syncMasterfees.
 */
export async function syncMasterfeesPayments(
    organizationId: string,
    deadline: number = Date.now() + 35_000,
    opts: { onlyMissing?: boolean } = {}
): Promise<SyncSummary> {
    const integration = await getMasterFeesIntegration(organizationId);
    if (!integration) throw new Error('Master Fees is not connected for this organization.');

    if (!(await acquireSyncLock(integration.id))) {
        return {
            invoices: { posted: 0, skipped: 0, voided: 0 },
            payments: { posted: 0, reclassified: 0, deferred: 0, skipped: 0 },
            errors: ['Skipped — a sync for this org is already in progress (concurrent cron tick).'],
            truncated: false,
        };
    }

    const summary: SyncSummary = {
        invoices: { posted: 0, skipped: 0, voided: 0 },
        payments: { posted: 0, reclassified: 0, deferred: 0, skipped: 0 },
        errors: [],
        truncated: false,
    };

    try {
        const config = integration.config;
        const client = new MasterFeesClient(config);

        if (!config.receivableAccountId) {
            config.receivableAccountId = await getReceivableAccount(organizationId);
            await patchConfig(organizationId, { receivableAccountId: config.receivableAccountId });
        }

        const transactions = await client.getTransactions();
        if (transactions.length >= MF_ROW_CAP) {
            summary.truncated = true;
            summary.errors.push(`transactions: Hit the ${MF_ROW_CAP.toLocaleString()}-record pagination safety ceiling — this school may have more transactions than we fetched this sync. Contact us if this persists.`);
        }

        const priorMap = await loadPriorRecords<PriorPaymentRecord>(
            organizationId, 'PAYMENT', 'amount, mf_status, journal_entry_id, cashbook_entry_id'
        );

        const queue = opts.onlyMissing
            ? transactions.filter(t => !priorMap.has(t.transaction_id))
            : transactions;

        let deferredByBudget = false;
        for (const txn of queue) {
            if (Date.now() > deadline) { deferredByBudget = true; break; }
            try {
                const r = await postPayment(organizationId, integration.id, config, txn, priorMap);
                summary.payments[r]++;
            } catch (err: any) {
                summary.errors.push(`payment ${txn.transaction_id}: ${err.message}`);
            }
        }

        if (deferredByBudget) {
            summary.errors.push('Time budget reached — remaining records deferred to the next sync cycle.');
        }

        void broadcastInvalidate(organizationId, [
            'cashbook-overview', 'cashbook-entries', 'cashbook-balance',
            'external-balances', 'inflows', 'wallets',
        ]);
    } catch (err: any) {
        summary.errors.push(`transactions: ${err.message}`);
    } finally {
        await releaseSyncLock(integration.id);
    }

    return summary;
}

async function runMasterfeesSync(
    organizationId: string,
    integration: { id: string; config: MasterFeesConfig },
    deadline: number
): Promise<SyncSummary> {
    const config = integration.config;
    const client = new MasterFeesClient(config);

    const summary: SyncSummary = {
        invoices: { posted: 0, skipped: 0, voided: 0 },
        payments: { posted: 0, reclassified: 0, deferred: 0, skipped: 0 },
        errors: [],
        truncated: false,
    };

    // Ensure the receivable account is provisioned + cached in config.
    if (!config.receivableAccountId) {
        config.receivableAccountId = await getReceivableAccount(organizationId);
        await patchConfig(organizationId, { receivableAccountId: config.receivableAccountId });
    }

    // Refresh fee-category → income-account mapping and build a name lookup.
    const categoriesByName = new Map<string, MFFeeCategory>();
    try {
        const categories = await client.getFeeCategories();
        for (const c of categories) {
            if (c.name) categoriesByName.set(c.name.trim().toLowerCase(), c);
            await getIncomeAccountForCategory(organizationId, config, c); // ensure account exists
        }
    } catch (err: any) {
        summary.errors.push(`fee-categories: ${err.message}`);
    }

    let deferredByBudget = false;

    // Invoices FIRST (they create the receivable that payments clear).
    try {
        const invoices = await client.getInvoices();
        if (invoices.length >= MF_ROW_CAP) {
            summary.truncated = true;
            summary.errors.push(`invoices: Hit the ${MF_ROW_CAP.toLocaleString()}-record pagination safety ceiling — this school may have more invoices than we fetched this sync. Contact us if this persists.`);
        }
        // Batch-preload idempotency state for ALL invoices in one query instead of
        // one row-by-row round trip per invoice — see loadPriorRecords doc comment.
        const priorMap = await loadPriorRecords<PriorInvoiceRecord>(organizationId, 'INVOICE', 'amount, mf_status, journal_entry_id');
        for (const inv of invoices) {
            if (Date.now() > deadline) { deferredByBudget = true; break; }
            try {
                const r = await postInvoice(organizationId, integration.id, config, inv, categoriesByName, priorMap);
                summary.invoices[r]++;
            } catch (err: any) {
                summary.errors.push(`invoice ${inv.invoice_id}: ${err.message}`);
            }
        }
    } catch (err: any) {
        summary.errors.push(`invoices: ${err.message}`);
    }

    // Payments SECOND.
    if (Date.now() <= deadline) {
        try {
            const transactions = await client.getTransactions();
            if (transactions.length >= MF_ROW_CAP) {
                summary.truncated = true;
                summary.errors.push(`transactions: Hit the ${MF_ROW_CAP.toLocaleString()}-record pagination safety ceiling — this school may have more transactions than we fetched this sync. Contact us if this persists.`);
            }
            const priorMap = await loadPriorRecords<PriorPaymentRecord>(organizationId, 'PAYMENT', 'amount, mf_status, journal_entry_id, cashbook_entry_id');
            for (const txn of transactions) {
                if (Date.now() > deadline) { deferredByBudget = true; break; }
                try {
                    const r = await postPayment(organizationId, integration.id, config, txn, priorMap);
                    summary.payments[r]++;
                } catch (err: any) {
                    summary.errors.push(`payment ${txn.transaction_id}: ${err.message}`);
                }
            }
        } catch (err: any) {
            summary.errors.push(`transactions: ${err.message}`);
        }
    } else {
        deferredByBudget = true;
    }

    if (deferredByBudget) {
        summary.errors.push('Time budget reached — remaining records deferred to the next sync cycle (runs every minute; large backlogs catch up over several cycles).');
    }

    await patchConfig(organizationId, {
        // Only mark fully caught-up when this pass wasn't cut short by the time
        // budget — a deferred pass still made real progress (each posted record
        // committed immediately) but hasn't reached the end of the feed yet.
        lastSyncedAt: deferredByBudget ? config.lastSyncedAt : new Date().toISOString(),
        lastSyncError: summary.errors.length ? summary.errors.slice(0, 3).join('; ') : null,
        lastSyncTruncated: summary.truncated,
    });

    void broadcastInvalidate(organizationId, [
        'cashbook-overview', 'cashbook-entries', 'cashbook-balance',
        'external-balances', 'inflows', 'wallets',
    ]);

    return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation — our posted receivable vs Master Fees' own outstanding total
// ─────────────────────────────────────────────────────────────────────────────
export async function reconcileMasterfees(organizationId: string): Promise<{
    moneywiseReceivable: number;
    masterfeesOutstanding: number;
    difference: number;
    studentsWithBalance: number;
}> {
    const integration = await getMasterFeesIntegration(organizationId);
    if (!integration) throw new Error('Master Fees is not connected for this organization.');
    const receivableId = integration.config.receivableAccountId || await getReceivableAccount(organizationId);

    // Our AR balance from the GL: sum(debit) - sum(credit) across the receivable account.
    let moneywiseReceivable = 0;
    const { data: lines } = await supabase
        .from('journal_lines')
        .select('debit, credit')
        .eq('account_id', receivableId);
    for (const l of lines || []) moneywiseReceivable += num(l.debit) - num(l.credit);

    // Master Fees' own view of what's outstanding.
    const client = new MasterFeesClient(integration.config);
    const balances = await client.getBalances();
    let masterfeesOutstanding = 0;
    let studentsWithBalance = 0;
    for (const b of balances) {
        const bal = num((b as any).net_outstanding ?? (b as any).balance_due ?? (b as any).net_balance ?? (b as any).balance);
        masterfeesOutstanding += bal;
        if (Math.abs(bal) > TOLERANCE) studentsWithBalance++;
    }

    return {
        moneywiseReceivable: Number(moneywiseReceivable.toFixed(2)),
        masterfeesOutstanding: Number(masterfeesOutstanding.toFixed(2)),
        difference: Number((moneywiseReceivable - masterfeesOutstanding).toFixed(2)),
        studentsWithBalance,
    };
}

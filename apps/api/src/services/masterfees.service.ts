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
const CODE_GENERIC_INCOME = 'QB-MF-INC-GENERAL';
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

    async getSchoolMeta(): Promise<{ school_name?: string }> {
        const resp = await this.get('invoices').catch(() => this.get('students'));
        return { school_name: resp?.school_name };
    }
    async getStudents(): Promise<MFStudent[]> { return this.list(await this.get('students')); }
    async getInvoices(): Promise<MFInvoice[]> { return this.list(await this.get('invoices')); }
    async getTransactions(): Promise<MFTransaction[]> { return this.list(await this.get('transactions')); }
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

async function postInvoice(
    organizationId: string,
    integrationId: string,
    config: MasterFeesConfig,
    invoice: MFInvoice,
    categoriesByName: Map<string, MFFeeCategory>
): Promise<'posted' | 'skipped' | 'voided'> {
    const total = num(invoice.total_amount);
    const studentName = invoice.student?.full_name || [invoice.student?.first_name, invoice.student?.last_name].filter(Boolean).join(' ');
    const voided = VOID_STATUSES.has(String(invoice.status || '').toLowerCase());

    // Idempotency: skip when nothing material changed since last sync.
    const { data: prior } = await supabase
        .from('masterfees_records')
        .select('amount, mf_status, journal_entry_id')
        .eq('organization_id', organizationId)
        .eq('record_type', 'INVOICE')
        .eq('mf_id', invoice.invoice_id)
        .maybeSingle();
    if (prior && Math.abs(num(prior.amount) - total) < TOLERANCE && (prior.mf_status || '') === (invoice.status || '') && !!prior.journal_entry_id === !voided) {
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

async function postPayment(
    organizationId: string,
    integrationId: string,
    config: MasterFeesConfig,
    txn: MFTransaction
): Promise<'posted' | 'reclassified' | 'deferred' | 'skipped'> {
    const amount = num(txn.amount);
    if (amount <= 0) return 'skipped';
    const studentName = txn.student?.full_name || [txn.student?.first_name, txn.student?.last_name].filter(Boolean).join(' ');
    const status = String(txn.status || '').toLowerCase();
    if (status && !['completed', 'complete', 'success', 'successful', 'paid'].includes(status)) return 'skipped';

    const { data: prior } = await supabase
        .from('masterfees_records')
        .select('amount, mf_status, journal_entry_id, cashbook_entry_id')
        .eq('organization_id', organizationId)
        .eq('record_type', 'PAYMENT')
        .eq('mf_id', txn.transaction_id)
        .maybeSingle();
    const unchanged = prior && Math.abs(num(prior.amount) - amount) < TOLERANCE;
    // Already visible as a cashbook inflow (current posting path) and unchanged.
    if (unchanged && prior!.cashbook_entry_id) {
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
    const existingInflow = await findExistingInflow(organizationId, txn.reference);
    const shared = config.lencoMode === 'shared' || !!existingInflow;
    const label = `Master Fees Payment ${txn.reference || txn.transaction_id.slice(0, 8)}${studentName ? ` — ${studentName}` : ''}`;

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
export interface SyncSummary {
    invoices: { posted: number; skipped: number; voided: number };
    payments: { posted: number; reclassified: number; deferred: number; skipped: number };
    errors: string[];
}

export async function syncMasterfees(organizationId: string): Promise<SyncSummary> {
    const integration = await getMasterFeesIntegration(organizationId);
    if (!integration) throw new Error('Master Fees is not connected for this organization.');
    const config = integration.config;
    const client = new MasterFeesClient(config);

    const summary: SyncSummary = {
        invoices: { posted: 0, skipped: 0, voided: 0 },
        payments: { posted: 0, reclassified: 0, deferred: 0, skipped: 0 },
        errors: [],
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

    // Invoices FIRST (they create the receivable that payments clear).
    try {
        for (const inv of await client.getInvoices()) {
            try {
                const r = await postInvoice(organizationId, integration.id, config, inv, categoriesByName);
                summary.invoices[r]++;
            } catch (err: any) {
                summary.errors.push(`invoice ${inv.invoice_id}: ${err.message}`);
            }
        }
    } catch (err: any) {
        summary.errors.push(`invoices: ${err.message}`);
    }

    // Payments SECOND.
    try {
        for (const txn of await client.getTransactions()) {
            try {
                const r = await postPayment(organizationId, integration.id, config, txn);
                summary.payments[r]++;
            } catch (err: any) {
                summary.errors.push(`payment ${txn.transaction_id}: ${err.message}`);
            }
        }
    } catch (err: any) {
        summary.errors.push(`transactions: ${err.message}`);
    }

    await patchConfig(organizationId, {
        lastSyncedAt: new Date().toISOString(),
        lastSyncError: summary.errors.length ? summary.errors.slice(0, 3).join('; ') : null,
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

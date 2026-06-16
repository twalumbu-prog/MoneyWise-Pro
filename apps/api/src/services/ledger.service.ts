import { supabase } from '../lib/supabase';

/**
 * Double-Entry General Ledger posting engine.
 *
 * This is the single source of truth for HOW a cash/wallet movement is translated
 * into a balanced journal entry (Sum debit = Sum credit). The existing
 * `cashbook_entries` table remains the single-sided cash book / source document;
 * for each non-PENDING, non-zero entry we derive one balanced `journal_entries`
 * row with its `journal_lines`.
 *
 * Design notes:
 * - The CASH leg is exact (the real wallet/cash movement). The CONTRA side is
 *   derived from categorization (requisition line items, or the entry's account_id,
 *   or the entry_type). Any residual that does not tie out is forced into a per-org
 *   "Uncategorised / Suspense" equity account so the entry always balances AND the
 *   gap is surfaced as a categorization worklist rather than silently corrupting totals.
 * - Only entries explicitly tagged to an income/expense account (via account_id or a
 *   line item) hit the P&L. Uncategorised cash lands in Suspense (equity), which keeps
 *   the balance sheet balanced and preserves parity with the existing P&L view.
 * - Idempotent: a journal entry is keyed by (organization_id, 'CASHBOOK', source_id),
 *   so re-posting deletes and rebuilds. Reclassifying a transaction later simply moves
 *   the contra off Suspense onto the real account.
 */

const TOLERANCE = 0.005;

// account-code → id cache, per org (codes are effectively static)
const accountCodeCache = new Map<string, string | null>(); // key: `${org}:${code}`
const suspenseCache = new Map<string, string>(); // org → suspense account id

// System account codes used for contra routing.
const CODE_MAIN_WALLET = 'QB-1150040000';
const CODE_UNCATEGORISED_ASSET = 'QB-1';
const CODE_OPENING_BALANCE_EQUITY = 'QB-76';
const CODE_SUSPENSE = 'QB-SUSPENSE';

interface CashbookRow {
    id: string;
    organization_id: string;
    date: string;
    description: string | null;
    reference_number: string | null;
    debit: number | string | null;
    credit: number | string | null;
    account_type: string | null;
    wallet_id: string | null;
    account_id: string | null;
    requisition_id: string | null;
    entry_type: string | null;
    status: string | null;
    created_by: string | null;
}

async function getAccountIdByCode(orgId: string, code: string): Promise<string | null> {
    const key = `${orgId}:${code}`;
    if (accountCodeCache.has(key)) return accountCodeCache.get(key)!;
    const { data } = await supabase
        .from('accounts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('code', code)
        .limit(1)
        .maybeSingle();
    const id = data?.id ?? null;
    accountCodeCache.set(key, id);
    return id;
}

/**
 * The per-org "Uncategorised / Suspense" equity account — a holding bucket for cash
 * that has not yet been classified as income, expense, capital or a liability. Created
 * on first use so the balance sheet always balances and the residual is visible.
 */
async function getOrCreateSuspenseAccount(orgId: string): Promise<string | null> {
    if (suspenseCache.has(orgId)) return suspenseCache.get(orgId)!;

    const existing = await getAccountIdByCode(orgId, CODE_SUSPENSE);
    if (existing) {
        suspenseCache.set(orgId, existing);
        return existing;
    }

    const { data, error } = await supabase
        .from('accounts')
        .insert({
            organization_id: orgId,
            code: CODE_SUSPENSE,
            name: 'Uncategorised / Suspense',
            type: 'EQUITY',
            subtype: 'Equity',
            description: 'Holding account for unclassified cash movements pending categorization.'
        })
        .select('id')
        .single();

    if (error || !data) {
        console.error(`[Ledger] Failed to create Suspense account for org ${orgId}:`, error?.message);
        return null;
    }
    accountCodeCache.set(`${orgId}:${CODE_SUSPENSE}`, data.id);
    suspenseCache.set(orgId, data.id);
    return data.id;
}

/** Resolve the ASSET account that represents the wallet/cash this entry moved. */
async function resolveCashAccount(ce: CashbookRow): Promise<string | null> {
    const orgId = ce.organization_id;

    if (ce.account_type === 'MONEYWISE_WALLET') {
        if (ce.wallet_id) {
            const { data: wallet } = await supabase
                .from('organization_wallets')
                .select('name, qb_account_id, is_main')
                .eq('id', ce.wallet_id)
                .maybeSingle();

            if (wallet && !wallet.is_main) {
                // A sub-wallet maps to its own asset account by name / qb id.
                let q = supabase
                    .from('accounts')
                    .select('id')
                    .eq('organization_id', orgId)
                    .eq('type', 'ASSET');
                q = wallet.qb_account_id
                    ? q.or(`name.eq.${wallet.name},qb_account_id.eq.${wallet.qb_account_id}`)
                    : q.eq('name', wallet.name);
                const { data: assetAcct } = await q.limit(1).maybeSingle();
                if (assetAcct) return assetAcct.id;
            }
        }
        // Main wallet (or unmatched sub-wallet) → the Main Wallet asset account.
        return (await getAccountIdByCode(orgId, CODE_MAIN_WALLET))
            ?? (await getAccountIdByCode(orgId, CODE_UNCATEGORISED_ASSET));
    }

    if (ce.account_type === 'CASH') {
        const { data: cashAcct } = await supabase
            .from('accounts')
            .select('id')
            .eq('organization_id', orgId)
            .eq('type', 'ASSET')
            .ilike('name', '%cash%')
            .limit(1)
            .maybeSingle();
        return cashAcct?.id ?? (await getAccountIdByCode(orgId, CODE_UNCATEGORISED_ASSET));
    }

    return getAccountIdByCode(orgId, CODE_UNCATEGORISED_ASSET);
}

/** Resolve the account a requisition line item points at (account_id or qb_account_id). */
async function resolveLineItemAccount(orgId: string, li: any): Promise<string | null> {
    if (li.account_id) return li.account_id;
    if (li.qb_account_id) {
        const { data } = await supabase
            .from('accounts')
            .select('id')
            .eq('organization_id', orgId)
            .eq('qb_account_id', li.qb_account_id)
            .limit(1)
            .maybeSingle();
        if (data) return data.id;
    }
    return null;
}

export const ledgerService = {
    /** Delete the journal entry (and its lines) derived from a cashbook entry. */
    async removeForCashbookEntry(entryId: string, organizationId?: string): Promise<void> {
        let q = supabase
            .from('journal_entries')
            .delete()
            .eq('source_type', 'CASHBOOK')
            .eq('source_id', entryId);
        if (organizationId) q = q.eq('organization_id', organizationId);
        await q;
    },

    /**
     * Post (or re-post) the balanced journal entry for one cashbook entry.
     * Skips PENDING and zero-amount marker rows. Always idempotent.
     */
    async repostForCashbookEntry(entryId: string): Promise<void> {
        const { data: ce } = await supabase
            .from('cashbook_entries')
            .select('id, organization_id, date, description, reference_number, debit, credit, account_type, wallet_id, account_id, requisition_id, entry_type, status, created_by')
            .eq('id', entryId)
            .maybeSingle();

        if (!ce) return;
        const orgId = ce.organization_id;

        // Idempotent rebuild.
        await this.removeForCashbookEntry(entryId, orgId);

        if (ce.status === 'PENDING') return; // not real money yet
        const debit = Number(ce.debit || 0);
        const credit = Number(ce.credit || 0);
        const amount = Math.abs(debit - credit);
        if (amount < TOLERANCE) return; // OPENING/CLOSING markers, no movement

        const cashAcct = await resolveCashAccount(ce as CashbookRow);
        if (!cashAcct) {
            console.error(`[Ledger] No cash account resolved for entry ${entryId}; skipping.`);
            return;
        }

        const cashIsDebit = debit >= credit; // money in → debit cash
        const contraSign = cashIsDebit ? -1 : +1; // contra is the opposite side

        // Signed accumulator: positive = net debit, negative = net credit.
        const net = new Map<string, number>();
        const add = (acct: string | null, signedDebit: number) => {
            if (!acct) acct = '__SUSPENSE__';
            net.set(acct, (net.get(acct) || 0) + signedDebit);
        };

        // Cash leg (exact).
        add(cashAcct, cashIsDebit ? amount : -amount);

        // Contra leg(s).
        if (ce.requisition_id) {
            const { data: lis } = await supabase
                .from('line_items')
                .select('account_id, qb_account_id, actual_amount, estimated_amount')
                .eq('requisition_id', ce.requisition_id);
            for (const li of lis || []) {
                const amt = Number(li.actual_amount ?? li.estimated_amount ?? 0);
                if (amt <= 0) continue;
                const acct = await resolveLineItemAccount(orgId, li);
                add(acct, contraSign * amt);
            }
        } else if (ce.account_id) {
            add(ce.account_id, contraSign * amount);
        } else if (ce.entry_type === 'OPENING_BALANCE') {
            add(await getAccountIdByCode(orgId, CODE_OPENING_BALANCE_EQUITY), contraSign * amount);
        } else {
            // Uncategorised inflow/outflow/return/adjustment → Suspense.
            add('__SUSPENSE__', contraSign * amount);
        }

        // Force balance: any residual (cash vs contra mismatch) lands in Suspense.
        const residual = -Array.from(net.values()).reduce((a, b) => a + b, 0);
        if (Math.abs(residual) > TOLERANCE) add('__SUSPENSE__', residual);

        // Resolve the Suspense placeholder to a real account id.
        if (net.has('__SUSPENSE__')) {
            const suspenseId = await getOrCreateSuspenseAccount(orgId);
            if (!suspenseId) {
                console.error(`[Ledger] No suspense account for org ${orgId}; cannot post entry ${entryId}.`);
                return;
            }
            const v = net.get('__SUSPENSE__')!;
            net.delete('__SUSPENSE__');
            net.set(suspenseId, (net.get(suspenseId) || 0) + v);
        }

        // Build the lines, dropping anything that nets to ~zero.
        const linesNet: { account_id: string; debit: number; credit: number }[] = [];
        for (const [acct, signed] of net.entries()) {
            if (Math.abs(signed) < TOLERANCE) continue;
            linesNet.push({
                account_id: acct,
                debit: signed > 0 ? Number(signed.toFixed(2)) : 0,
                credit: signed < 0 ? Number((-signed).toFixed(2)) : 0
            });
        }

        const totalDebit = linesNet.reduce((s, l) => s + l.debit, 0);
        const totalCredit = linesNet.reduce((s, l) => s + l.credit, 0);
        if (linesNet.length < 2 || Math.abs(totalDebit - totalCredit) > TOLERANCE) {
            console.error(`[Ledger] Refusing to post unbalanced/degenerate entry ${entryId} (Dr ${totalDebit} Cr ${totalCredit}).`);
            return;
        }

        // Insert header, then lines. On failure, roll back the header to avoid orphans.
        const { data: je, error: jeErr } = await supabase
            .from('journal_entries')
            .insert({
                organization_id: orgId,
                entry_date: ce.date,
                description: ce.description,
                reference_number: ce.reference_number,
                source_type: 'CASHBOOK',
                source_id: ce.id,
                created_by: ce.created_by
            })
            .select('id')
            .single();

        if (jeErr || !je) {
            console.error(`[Ledger] Failed to insert journal header for ${entryId}:`, jeErr?.message);
            return;
        }

        const { error: lineErr } = await supabase
            .from('journal_lines')
            .insert(linesNet.map(l => ({ journal_entry_id: je.id, ...l })));

        if (lineErr) {
            console.error(`[Ledger] Failed to insert journal lines for ${entryId}:`, lineErr.message);
            await supabase.from('journal_entries').delete().eq('id', je.id);
        }
    },

    /** Re-post every cashbook entry linked to a requisition (after categorization changes). */
    async repostForRequisition(requisitionId: string): Promise<void> {
        const { data: entries } = await supabase
            .from('cashbook_entries')
            .select('id')
            .eq('requisition_id', requisitionId);
        for (const e of entries || []) {
            await this.repostForCashbookEntry(e.id);
        }
    },

    /**
     * Reconciliation safety net: re-post every cashbook entry whose journal is missing
     * or stale for one org. Idempotent; safe to run on a schedule. Returns the count
     * repaired so callers can log/no-op quietly when there is nothing to do.
     */
    async runSweep(organizationId: string): Promise<number> {
        const { data, error } = await supabase.rpc('cashbook_entries_needing_repost', {
            p_organization_id: organizationId
        });
        if (error) {
            console.error(`[Ledger] sweep detector failed for org ${organizationId}:`, error.message);
            return 0;
        }
        let repaired = 0;
        for (const row of (data as { id: string }[]) || []) {
            await this.repostForCashbookEntry(row.id);
            repaired++;
        }
        if (repaired > 0) console.log(`[Ledger] sweep repaired ${repaired} entries for org ${organizationId}.`);
        return repaired;
    },

    /** Run the reconciliation sweep across all organizations. */
    async runSweepAllOrgs(): Promise<number> {
        const { data: orgs } = await supabase.from('organizations').select('id');
        let total = 0;
        for (const o of orgs || []) {
            total += await this.runSweep(o.id);
        }
        return total;
    }
};

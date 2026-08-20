/**
 * accounting.util.ts — The one place that answers "is this entry accounted for".
 *
 * cashbook_entries.account_id is NOT that answer on its own. ledger.service.ts's
 * repostForCashbookEntry() resolves an entry's real classification three
 * different ways depending on shape — a requisition's line items, the entry's
 * own account_id, or an equity/Suspense fallback — and only *it* knows which
 * path was taken. Re-deriving that resolution here (or in read tools) would
 * drift from it the moment the ledger's routing logic changes. Reading its
 * output instead — journal_lines, which is what it actually posted — cannot
 * drift, because it *is* the ledger.
 *
 * Concretely: an entry is accounted for iff its posted journal has no line on
 * the org's Suspense account. A requisition entry with two line items, one
 * classified and one not, posts two contra lines — one to the real account,
 * one to Suspense — and correctly shows here as still needing attention,
 * without this file needing to know requisitions or line items exist.
 */

import { supabase } from '../../../lib/supabase';

const CODE_SUSPENSE = 'QB-SUSPENSE';

export interface EntryAccounting {
    /** False if any posted amount for this entry landed in Suspense, or no journal exists yet. */
    accounted: boolean;
    /** The account that took the largest share of this entry's contra amount, if any. */
    dominantAccountId: string | null;
    dominantAccountName: string | null;
}

/**
 * Looks up the true accounting status for a batch of cashbook_entries ids by
 * reading their posted journal_lines. One round trip for the org's Suspense
 * account, one for the journals, one for the lines — flat regardless of how
 * many entries are asked about.
 */
export async function resolveEntryAccounting(
    organizationId: string,
    entryIds: string[]
): Promise<Map<string, EntryAccounting>> {
    const result = new Map<string, EntryAccounting>();
    if (!entryIds.length) return result;

    const [{ data: suspense }, { data: journals }] = await Promise.all([
        supabase.from('accounts').select('id').eq('organization_id', organizationId).eq('code', CODE_SUSPENSE).maybeSingle(),
        supabase
            .from('journal_entries')
            .select('id, source_id')
            .eq('organization_id', organizationId)
            .eq('source_type', 'CASHBOOK')
            .in('source_id', entryIds),
    ]);

    const journalIdToEntryId = new Map<string, string>();
    for (const j of journals ?? []) journalIdToEntryId.set(j.id, j.source_id);

    // No journal posted yet at all (repost hasn't run) — cannot claim accounted.
    const journaledEntryIds = new Set(journalIdToEntryId.values());
    for (const id of entryIds) {
        if (!journaledEntryIds.has(id)) result.set(id, { accounted: false, dominantAccountId: null, dominantAccountName: null });
    }

    const journalIds = [...journalIdToEntryId.keys()];
    if (!journalIds.length) return result;

    const { data: lines } = await supabase
        .from('journal_lines')
        .select('journal_entry_id, account_id, debit, credit, accounts(name)')
        .in('journal_entry_id', journalIds);

    // Per entry: every contra account touched and how much (to find the
    // dominant one), plus whether Suspense was ever touched.
    const perEntry = new Map<string, { hitSuspense: boolean; byAccount: Map<string, { name: string; amount: number }> }>();
    for (const entryId of journaledEntryIds) perEntry.set(entryId, { hitSuspense: false, byAccount: new Map() });

    for (const line of lines ?? []) {
        const entryId = journalIdToEntryId.get(line.journal_entry_id);
        if (!entryId) continue;
        const bucket = perEntry.get(entryId);
        if (!bucket) continue;

        const amount = Number(line.debit || 0) + Number(line.credit || 0);
        if (suspense?.id && line.account_id === suspense.id) {
            bucket.hitSuspense = true;
            continue; // Suspense itself is never the "dominant real account" to report.
        }
        if (!line.account_id) continue;

        const accountName = (line as any).accounts?.name ?? null;
        const cur = bucket.byAccount.get(line.account_id) ?? { name: accountName ?? '', amount: 0 };
        cur.amount += amount;
        if (accountName) cur.name = accountName;
        bucket.byAccount.set(line.account_id, cur);
    }

    for (const [entryId, bucket] of perEntry) {
        let dominant: { id: string; name: string; amount: number } | null = null;
        for (const [accountId, v] of bucket.byAccount) {
            if (!dominant || v.amount > dominant.amount) dominant = { id: accountId, name: v.name, amount: v.amount };
        }
        result.set(entryId, {
            accounted: !bucket.hitSuspense,
            dominantAccountId: dominant?.id ?? null,
            dominantAccountName: dominant?.name ?? null,
        });
    }

    return result;
}

/** Convenience wrapper for callers that only need the unaccounted subset. */
export async function findUnaccountedEntryIds(organizationId: string, entryIds: string[]): Promise<Set<string>> {
    const statuses = await resolveEntryAccounting(organizationId, entryIds);
    const out = new Set<string>();
    for (const [id, status] of statuses) if (!status.accounted) out.add(id);
    return out;
}

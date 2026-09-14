import { supabase } from '../lib/supabase';
import { ledgerService } from '../services/ledger.service';

/**
 * One-off backfill for the "classification wrote cashbook_entries.account_id but
 * nothing reposted the GL" gap for NON-requisition entries — mainly Lenco webhook
 * rule-engine auto-classification of inflows (apps/api/src/controllers/
 * lenco.webhook.controller.ts handleLencoWebhook and processQuickLinkPayment),
 * which raced the entry's own fire-and-forget initial GL post and, when the
 * initial post won, left the contra stuck in Suspense forever since nothing
 * reposted afterward. Both call sites now call ledgerService.repostForCashbookEntry
 * right after writing account_id.
 *
 * None of the three earlier backfills in this session touched these rows — they
 * were all scoped to cashbook_entries.requisition_id IS NOT NULL. This one finds
 * every cashbook_entries row (any org) with account_id already set whose current
 * journal is still posted against that org's QB-SUSPENSE account, and reposts it.
 * repostForCashbookEntry is idempotent (deletes + rebuilds the journal entry from
 * current data), so this is safe to run standalone or alongside the others.
 */

async function findAffectedEntryIds(): Promise<string[]> {
    const { data: susp, error: suspErr } = await supabase
        .from('accounts')
        .select('id, organization_id')
        .eq('code', 'QB-SUSPENSE');
    if (suspErr) throw suspErr;

    const affected: string[] = [];

    // Scope everything per-organization — a single cross-org query over
    // journal_lines/journal_entries returned oversized response headers.
    for (const a of susp || []) {
        const orgId = (a as any).organization_id as string;
        const suspenseId = (a as any).id as string;

        const { data: lines, error: linesErr } = await supabase
            .from('journal_lines')
            .select('journal_entry_id')
            .eq('account_id', suspenseId);
        if (linesErr) throw linesErr;

        const journalEntryIds = Array.from(new Set((lines || []).map((l: any) => l.journal_entry_id as string)));
        if (journalEntryIds.length === 0) continue;

        const CHUNK = 200;
        const cashbookEntryIds = new Set<string>();
        for (let i = 0; i < journalEntryIds.length; i += CHUNK) {
            const chunk = journalEntryIds.slice(i, i + CHUNK);
            const { data: jes, error: jeErr } = await supabase
                .from('journal_entries')
                .select('id, source_id')
                .eq('organization_id', orgId)
                .eq('source_type', 'CASHBOOK')
                .in('id', chunk);
            if (jeErr) throw jeErr;
            for (const je of jes || []) cashbookEntryIds.add((je as any).source_id as string);
        }
        if (cashbookEntryIds.size === 0) continue;

        const idsArr = Array.from(cashbookEntryIds);
        for (let i = 0; i < idsArr.length; i += CHUNK) {
            const chunk = idsArr.slice(i, i + CHUNK);
            const { data: ces, error: ceErr } = await supabase
                .from('cashbook_entries')
                .select('id, account_id')
                .eq('organization_id', orgId)
                .in('id', chunk)
                .not('account_id', 'is', null);
            if (ceErr) throw ceErr;
            for (const ce of ces || []) affected.push((ce as any).id as string);
        }
    }
    return affected;
}

async function main() {
    const ids = await findAffectedEntryIds();
    console.log(`[Backfill] Found ${ids.length} non-requisition cashbook entries with a resolved account still posted to Suspense.`);

    let done = 0;
    let failed = 0;
    for (const id of ids) {
        try {
            await ledgerService.repostForCashbookEntry(id);
        } catch (err: any) {
            failed++;
            console.error(`  [FAIL] entry ${id}: ${err?.message}`);
        }
        if (++done % 25 === 0) console.log(`  ...${done}/${ids.length}`);
    }
    console.log(`[Backfill] Done. ${done - failed} succeeded, ${failed} failed.`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });

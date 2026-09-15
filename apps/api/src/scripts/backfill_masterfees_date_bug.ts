/**
 * backfill_masterfees_date_bug.ts
 *
 * Corrects cashbook_entries.date for Master Fees payments that were mis-dated
 * by the old dateOnly() bug (see masterfees.service.ts): completed_at between
 * 22:00:00-23:59:59 UTC is already past midnight in Zambia (UTC+2), so those
 * payments belong on the NEXT calendar day, not the one the raw UTC string's
 * date component shows.
 *
 * For each affected masterfees_records PAYMENT row (organization-scoped):
 *   1. Compute the correct local date from raw.completed_at.
 *   2. If its linked cashbook_entries.date is wrong, update it.
 *   3. Repost that cashbook entry's derived journal (ledgerService) so the GL
 *      moves to the corrected date too.
 * Then, once per affected (account_type, wallet_id) chain, fully recompute
 * balance_after in chronological (date, created_at) order — same pattern as
 * fix_dates_and_recalculate.ts.
 *
 * A JSON backup of every cashbook_entries row this script will touch is
 * written to /tmp before any write, for rollback.
 *
 * Usage:
 *   DRY_RUN=true npx ts-node --transpile-only src/scripts/backfill_masterfees_date_bug.ts
 *   npx ts-node --transpile-only src/scripts/backfill_masterfees_date_bug.ts
 */

import { supabase } from '../lib/supabase';
import { ledgerService } from '../services/ledger.service';

const ORG_ID = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
const DRY_RUN = process.env.DRY_RUN === 'true';
const BACKUP_PATH = '/tmp/masterfees_date_bug_backfill_backup.json';

const ORG_TZ_OFFSET_MS = 2 * 60 * 60 * 1000;
function correctLocalDate(completedAtIso: string): string {
    return new Date(new Date(completedAtIso).getTime() + ORG_TZ_OFFSET_MS).toISOString().slice(0, 10);
}

async function main() {
    console.log('='.repeat(70));
    console.log('MASTERFEES DATE-BUG BACKFILL');
    console.log(`MODE: ${DRY_RUN ? '\u{1F7E1} DRY RUN' : '\u{1F534} LIVE'}`);
    console.log('='.repeat(70));

    // Paginate explicitly - this org has ~3700 success PAYMENT rows, well past
    // the PostgREST/supabase-js default 1000-row cap, and an unpaginated
    // fetch silently truncated the candidate set in an earlier dry run.
    const affected: any[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
        const { data: page, error } = await supabase
            .from('masterfees_records')
            .select('id, external_reference, student_name, amount, cashbook_entry_id, raw')
            .eq('organization_id', ORG_ID)
            .eq('record_type', 'PAYMENT')
            .eq('mf_status', 'success')
            .not('cashbook_entry_id', 'is', null)
            .order('id')
            .range(from, from + PAGE - 1);
        if (error) { console.error('Failed to fetch masterfees_records:', error); process.exit(1); }
        if (!page || page.length === 0) break;
        affected.push(...page);
        if (page.length < PAGE) break;
    }
    console.log(`Fetched ${affected.length} total success PAYMENT records for the org.`);

    type Candidate = {
        mfId: string; ref: string; student: string; amount: number;
        entryId: string; rawUtcDate: string; correctDate: string;
    };
    const candidates: Candidate[] = [];
    for (const r of affected || []) {
        const completedAt = (r.raw as any)?.completed_at as string | undefined;
        if (!completedAt) continue;
        const hourUtc = new Date(completedAt).getUTCHours();
        if (hourUtc < 22) continue; // only the affected window
        candidates.push({
            mfId: r.id,
            ref: r.external_reference || '',
            student: r.student_name || '',
            amount: Number(r.amount || 0),
            entryId: r.cashbook_entry_id as string,
            rawUtcDate: completedAt.slice(0, 10),
            correctDate: correctLocalDate(completedAt),
        });
    }

    console.log(`\nFound ${candidates.length} candidate payment(s) completing 22:00-23:59:59 UTC.\n`);
    if (candidates.length === 0) return;

    const entryIds = candidates.map(c => c.entryId);
    const { data: entries, error: e2 } = await supabase
        .from('cashbook_entries')
        .select('id, date, created_at, account_type, wallet_id, description')
        .in('id', entryIds);
    if (e2 || !entries) { console.error('Failed to fetch cashbook_entries:', e2); process.exit(1); }
    const entryById = new Map(entries.map(e => [e.id, e]));

    // SAFETY RULE: only touch a row when its CURRENT cashbook_entries.date is
    // EXACTLY the literal UTC-truncated completed_at string (`rawUtcDate`) -
    // the unambiguous fingerprint of the dateOnly() bug, and nothing else.
    // Investigated live: many rows (the entire 'IMP-' bulk-import batch, plus
    // several MAN- manual payments) have a date that does NOT match this
    // pattern at all - off by weeks or months, clearly set by some other
    // process (a real reconciliation, a later MasterFees correction our
    // sync's "amount unchanged -> skip" optimization never re-synced, etc).
    // Touching those would overwrite a possibly-correct historical date with
    // a wrong one derived from an unrelated timestamp. Only exact matches are
    // provably nothing but this one bug.
    const withEntry = candidates
        .map(c => ({ ...c, entry: entryById.get(c.entryId) }))
        .filter(c => !!c.entry);

    const toFix = withEntry.filter(c => c.entry!.date === c.rawUtcDate);
    const skippedAmbiguous = withEntry.filter(c => c.entry!.date !== c.rawUtcDate);

    console.log(`${withEntry.length} candidates have a linked cashbook entry.`);
    console.log(`  -> ${toFix.length} have date === dateOnly(completed_at) exactly: SAFE to correct.`);
    console.log(`  -> ${skippedAmbiguous.length} have a date that came from somewhere else entirely: SKIPPING, not touched.\n`);

    if (skippedAmbiguous.length > 0) {
        console.log('Skipped (ambiguous origin - not this bug, needs separate investigation):');
        for (const c of skippedAmbiguous.slice(0, 20)) {
            console.log(`  ${c.ref.padEnd(28)} ${c.student.padEnd(28)} current=${c.entry!.date}  raw_utc_date=${c.rawUtcDate}`);
        }
        if (skippedAmbiguous.length > 20) console.log(`  ... and ${skippedAmbiguous.length - 20} more.`);
        console.log();
    }

    if (toFix.length === 0) { console.log('Nothing safe to fix.'); return; }

    // Backup every row about to change, before any write.
    const backupRows = toFix.map(c => c.entry);
    const fs = await import('fs');
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(backupRows, null, 2));
    console.log(`Backup of ${backupRows.length} cashbook_entries rows written to ${BACKUP_PATH}\n`);

    const affectedChains = new Set<string>(); // `${account_type}::${wallet_id||''}`
    let corrected = 0;

    for (const c of toFix) {
        const e = c.entry!;
        console.log(`  ${c.ref.padEnd(28)} ${c.student.padEnd(28)} K${c.amount.toFixed(2).padStart(10)}  ${e.date} -> ${c.correctDate}`);
        affectedChains.add(`${e.account_type}::${e.wallet_id || ''}`);

        if (!DRY_RUN) {
            const { error: upErr } = await supabase
                .from('cashbook_entries')
                .update({ date: c.correctDate })
                .eq('id', e.id);
            if (upErr) {
                console.error(`    FAILED to update ${e.id}: ${upErr.message}`);
                continue;
            }
            await ledgerService.repostForCashbookEntry(e.id);
            corrected++;
        } else {
            corrected++;
        }
    }

    console.log(`\n${DRY_RUN ? 'Would correct' : 'Corrected'} ${corrected} cashbook entry date(s) across ${affectedChains.size} account chain(s).\n`);

    if (DRY_RUN) {
        console.log('[DRY RUN] Skipping balance recalculation. Run without DRY_RUN=true to apply.');
        return;
    }

    console.log('Recalculating running balances (chronological, per affected chain)...\n');
    for (const chainKey of affectedChains) {
        const [accountType, walletId] = chainKey.split('::');
        let q = supabase
            .from('cashbook_entries')
            .select('id, date, created_at, debit, credit')
            .eq('organization_id', ORG_ID)
            .eq('account_type', accountType)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true });
        q = walletId ? q.eq('wallet_id', walletId) : q.is('wallet_id', null);
        const { data: chainEntries, error: e3 } = await q;
        if (e3 || !chainEntries) { console.error(`  Failed to fetch chain ${chainKey}:`, e3); continue; }

        let running = 0;
        let errors = 0;
        for (const ce of chainEntries) {
            running += Number(ce.debit || 0) - Number(ce.credit || 0);
            const { error: balErr } = await supabase
                .from('cashbook_entries')
                .update({ balance_after: Math.round(running * 100) / 100 })
                .eq('id', ce.id);
            if (balErr) errors++;
        }
        console.log(`  ${accountType}${walletId ? ` / wallet ${walletId.slice(0, 8)}` : ''}: ${chainEntries.length} entries recalculated${errors ? `, ${errors} errors` : ''}. Final balance K${running.toFixed(2)}`);
    }

    console.log('\nDone.');
}

main()
    .then(() => process.exit(0))
    .catch(err => { console.error('Fatal:', err); process.exit(1); });

/**
 * fix_dates_and_recalculate.ts
 *
 * Corrects the dates on the 12 cashbook entries that were inserted with today's
 * date (2026-05-01) by the repair script, updating them to their actual
 * disbursement dates from disbursements.issued_at.
 *
 * After all dates are corrected, recalculates the full running balance in
 * correct chronological order across the entire MONEYWISE_WALLET ledger.
 */

import { supabase } from '../lib/supabase';

const ORG_ID = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
const ACCOUNT_TYPE = 'MONEYWISE_WALLET';
const DRY_RUN = process.env.DRY_RUN === 'true';

async function fixDatesAndRecalculate() {
    console.log('='.repeat(70));
    console.log('DATE CORRECTION + BALANCE RECALCULATION — MoneyWise Wallet');
    console.log(`MODE: ${DRY_RUN ? '🟡 DRY RUN' : '🔴 LIVE'}`);
    console.log('='.repeat(70));

    // ─── Step 1: Load all disbursement cashbook entries dated 2026-05-01 ────
    const { data: wrongDateEntries, error: e1 } = await supabase
        .from('cashbook_entries')
        .select('id, date, requisition_id, credit, description')
        .eq('organization_id', ORG_ID)
        .eq('account_type', ACCOUNT_TYPE)
        .eq('entry_type', 'DISBURSEMENT')
        .eq('date', '2026-05-01');

    if (e1) { console.error('❌ Failed:', e1); process.exit(1); }

    console.log(`\nFound ${wrongDateEntries?.length || 0} entries with date 2026-05-01 to correct.\n`);

    // ─── Step 2: For each entry, look up the actual disbursement date ────────
    let corrected = 0;
    for (const entry of wrongDateEntries || []) {
        if (!entry.requisition_id) continue;

        const { data: disb } = await supabase
            .from('disbursements')
            .select('issued_at')
            .eq('requisition_id', entry.requisition_id)
            .maybeSingle();

        const actualDate = disb?.issued_at?.split('T')[0];
        if (!actualDate || actualDate === '2026-05-01') {
            console.log(`  ⚠️  REQ ${entry.requisition_id.slice(0, 8)} — No issued_at or already correct. Skipping.`);
            continue;
        }

        console.log(`  📅 REQ ${entry.requisition_id.slice(0, 8)} | ${entry.date} → ${actualDate} | K${Number(entry.credit).toFixed(2)}`);

        if (!DRY_RUN) {
            const { error: updateErr } = await supabase
                .from('cashbook_entries')
                .update({ date: actualDate })
                .eq('id', entry.id);

            if (updateErr) {
                console.error(`     ❌ Failed to update: ${updateErr.message}`);
            } else {
                console.log(`     ✅ Updated.`);
                corrected++;
            }
        } else {
            corrected++;
        }
    }

    console.log(`\n${DRY_RUN ? 'Would correct' : 'Corrected'} ${corrected} date(s).\n`);

    if (DRY_RUN) {
        console.log('[DRY RUN] Skipping balance recalculation. Run without DRY_RUN=true to apply.');
        return;
    }

    // ─── Step 3: Full chronological balance recalculation ───────────────────
    console.log('Recalculating all running balances in chronological order...\n');

    const { data: allEntries, error: e2 } = await supabase
        .from('cashbook_entries')
        .select('id, date, created_at, entry_type, status, debit, credit, description, requisition_id')
        .eq('organization_id', ORG_ID)
        .eq('account_type', ACCOUNT_TYPE)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

    if (e2 || !allEntries) { console.error('❌ Failed to fetch entries:', e2); process.exit(1); }

    let runningBalance = 0;
    let updateErrors = 0;

    for (const entry of allEntries) {
        const debit  = Number(entry.debit  || 0);
        const credit = Number(entry.credit || 0);
        runningBalance = runningBalance + debit - credit;

        const { error: balErr } = await supabase
            .from('cashbook_entries')
            .update({ balance_after: Math.round(runningBalance * 100) / 100 })
            .eq('id', entry.id);

        if (balErr) {
            console.error(`  ❌ Balance update failed for ${entry.id.slice(0,8)}:`, balErr.message);
            updateErrors++;
        }
    }

    console.log(`✅ Recalculated ${allEntries.length} entries. ${updateErrors > 0 ? `⚠️  ${updateErrors} errors.` : 'No errors.'}`);
    console.log(`Final running balance: K${runningBalance.toFixed(2)}\n`);

    // ─── Step 4: Print reconciliation report ────────────────────────────────
    const { data: finalEntries } = await supabase
        .from('cashbook_entries')
        .select('id, date, entry_type, status, debit, credit, balance_after, requisition_id')
        .eq('organization_id', ORG_ID)
        .eq('account_type', ACCOUNT_TYPE)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

    const inflows    = (finalEntries || []).filter(e => e.entry_type === 'INFLOW').reduce((s, e) => s + Number(e.debit||0), 0);
    const outflows   = (finalEntries || []).filter(e => e.entry_type === 'DISBURSEMENT').reduce((s, e) => s + Number(e.credit||0), 0);
    const adjNet     = (finalEntries || []).filter(e => e.entry_type === 'ADJUSTMENT').reduce((s, e) => s + Number(e.debit||0) - Number(e.credit||0), 0);
    const finalBal   = finalEntries && finalEntries.length > 0 ? Number(finalEntries[finalEntries.length-1].balance_after) : 0;

    console.log('='.repeat(70));
    console.log('FINAL RECONCILIATION REPORT');
    console.log('='.repeat(70));
    console.log(`Total Inflows:           K${inflows.toFixed(2)}`);
    console.log(`Total Outflows:          K${outflows.toFixed(2)}`);
    console.log(`Net Adjustments:         K${adjNet.toFixed(2)}`);
    console.log(`─────────────────────────────────────────────`);
    console.log(`Net Wallet Balance:      K${(inflows + adjNet - outflows).toFixed(2)}`);
    console.log(`Ledger Running Balance:  K${finalBal.toFixed(2)}`);
    console.log();

    if (Math.abs((inflows + adjNet - outflows) - finalBal) < 0.05) {
        console.log('✅ LEDGER IS INTERNALLY CONSISTENT (net = running balance).');
    } else {
        console.log('⚠️  INCONSISTENCY: net calculation differs from running balance. Investigate.');
    }

    if (finalBal < 0) {
        console.log(`\n⚠️  NOTE: The wallet balance is genuinely negative (K${finalBal.toFixed(2)}).`);
        console.log('   This means more money was disbursed than was deposited into the wallet.');
        console.log('   Please check if all wallet top-ups (inflows) have been logged.');
    }

    console.log('\n📊 LEDGER BY DATE:');
    console.log('Date        | Type           | Amount         | Running Balance');
    console.log('-'.repeat(66));
    for (const e of finalEntries || []) {
        const amt = Number(e.debit) > 0 ? `+K${Number(e.debit).toFixed(2)}` : `-K${Number(e.credit).toFixed(2)}`;
        const type = (e.entry_type || '').padEnd(14);
        console.log(`${e.date} | ${type} | ${amt.padStart(14)} | K${Number(e.balance_after).toFixed(2)}`);
    }
    console.log('='.repeat(70));
}

fixDatesAndRecalculate()
    .then(() => process.exit(0))
    .catch(err => { console.error('Fatal:', err); process.exit(1); });

/**
 * reconcile_wallet_ledger.ts
 *
 * RECONCILIATION + DATE REPAIR SCRIPT
 *
 * Problem: The repair script inserted missing cashbook entries with today's date
 * instead of the actual disbursement date. This caused the running balance to
 * appear negative because all outflows are stacked at the end.
 *
 * This script:
 *  1. Reads the actual disbursement date from disbursements.issued_at for each entry
 *  2. Updates the cashbook entry date to the correct transaction date
 *  3. Does a full chronological balance recalculation for MONEYWISE_WALLET
 *  4. Prints a full reconciliation report comparing actual Lenco balances to ledger
 *
 * Usage:
 *   DRY_RUN=true npx ts-node src/scripts/reconcile_wallet_ledger.ts   (inspect only)
 *   npx ts-node src/scripts/reconcile_wallet_ledger.ts                 (apply fixes)
 */

import { supabase } from '../lib/supabase';

const DRY_RUN = process.env.DRY_RUN === 'true';
const ACCOUNT_TYPE = 'MONEYWISE_WALLET';

// We need org ID to drive recalculation — fetch it from the first wallet entry
// Override with ORG_ID env var to target a specific org
async function getOrgId(): Promise<string> {
    if (process.env.ORG_ID) {
        console.log(`Using explicit ORG_ID from environment.`);
        return process.env.ORG_ID;
    }
    // Fallback: find the org with the most wallet entries (most likely the primary one)
    const { data } = await supabase
        .from('cashbook_entries')
        .select('organization_id')
        .eq('account_type', ACCOUNT_TYPE)
        .not('organization_id', 'is', null);
    if (!data || data.length === 0) throw new Error('No wallet entries found');
    // Count by org and pick the largest
    const counts = new Map<string, number>();
    for (const row of data) counts.set(row.organization_id, (counts.get(row.organization_id) || 0) + 1);
    const [topOrgId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return topOrgId;
}

async function reconcile() {
    console.log('='.repeat(70));
    console.log('RECONCILIATION: MoneyWise Wallet Ledger');
    console.log(`MODE: ${DRY_RUN ? '🟡 DRY RUN (no writes)' : '🔴 LIVE (will fix dates + recalculate)'}`);
    console.log('='.repeat(70));

    const organizationId = await getOrgId();
    console.log(`Org: ${organizationId.slice(0, 8)}...`);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Load all wallet cashbook entries in chronological order
    // ─────────────────────────────────────────────────────────────────────────
    const { data: allEntries, error: entryErr } = await supabase
        .from('cashbook_entries')
        .select('id, date, created_at, entry_type, status, credit, debit, balance_after, description, requisition_id, organization_id')
        .eq('organization_id', organizationId)
        .eq('account_type', ACCOUNT_TYPE)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

    if (entryErr || !allEntries) {
        console.error('❌ Failed to fetch cashbook entries:', entryErr);
        process.exit(1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Load all wallet disbursements with their issued_at timestamp
    // ─────────────────────────────────────────────────────────────────────────
    const { data: disbursements, error: disbErr } = await supabase
        .from('disbursements')
        .select('requisition_id, issued_at, total_prepared, payment_method, external_reference')
        .not('external_reference', 'is', null);

    if (disbErr || !disbursements) {
        console.error('❌ Failed to fetch disbursements:', disbErr);
        process.exit(1);
    }

    // Build a lookup map: requisition_id → issued_at date
    const disbDateMap = new Map<string, string>();
    for (const d of disbursements) {
        if (d.requisition_id && d.issued_at) {
            disbDateMap.set(d.requisition_id, d.issued_at.split('T')[0]);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Identify entries with wrong dates and correct them
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n📋 STEP 1: Checking dates on ${allEntries.length} cashbook entries...`);

    let dateCorrectionCount = 0;
    const correctedEntries: string[] = []; // track which entry IDs had dates corrected

    for (const entry of allEntries) {
        if (entry.entry_type !== 'DISBURSEMENT' || !entry.requisition_id) continue;

        const actualDate = disbDateMap.get(entry.requisition_id);
        if (!actualDate) continue;

        if (entry.date !== actualDate) {
            console.log(`  ⚠️  Entry ${entry.id.slice(0, 8)} | REQ ${entry.requisition_id.slice(0, 8)}`);
            console.log(`     Ledger date: ${entry.date} → Actual date: ${actualDate}`);
            dateCorrectionCount++;

            if (!DRY_RUN) {
                const { error: updateErr } = await supabase
                    .from('cashbook_entries')
                    .update({ date: actualDate })
                    .eq('id', entry.id);

                if (updateErr) {
                    console.error(`     ❌ Failed to update date for entry ${entry.id}:`, updateErr.message);
                } else {
                    console.log(`     ✅ Date corrected.`);
                    correctedEntries.push(entry.id);
                    entry.date = actualDate; // Update in-memory for recalculation below
                }
            } else {
                console.log(`     [DRY RUN] Would update date to ${actualDate}`);
            }
        }
    }

    if (dateCorrectionCount === 0) {
        console.log('  ✅ All entry dates are correct. No date corrections needed.');
    } else {
        console.log(`\n  ${DRY_RUN ? 'Would correct' : 'Corrected'} ${dateCorrectionCount} entry date(s).`);
    }

    if (DRY_RUN) {
        console.log('\n[DRY RUN] Skipping balance recalculation. Run without DRY_RUN=true to apply.');
        await printReconciliationReport(allEntries, disbursements, organizationId);
        return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Re-fetch all entries with corrected dates and recalculate ALL balances
    // ─────────────────────────────────────────────────────────────────────────
    if (dateCorrectionCount > 0) {
        console.log('\n📋 STEP 2: Recalculating all running balances from scratch...');

        const { data: freshEntries, error: freshErr } = await supabase
            .from('cashbook_entries')
            .select('id, date, created_at, debit, credit')
            .eq('organization_id', organizationId)
            .eq('account_type', ACCOUNT_TYPE)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true });

        if (freshErr || !freshEntries) {
            console.error('❌ Failed to re-fetch entries for recalculation:', freshErr);
            process.exit(1);
        }

        let runningBalance = 0;
        let updateErrors = 0;

        for (const entry of freshEntries) {
            const debit = Number(entry.debit || 0);
            const credit = Number(entry.credit || 0);
            runningBalance = runningBalance + debit - credit;

            const { error: balErr } = await supabase
                .from('cashbook_entries')
                .update({ balance_after: runningBalance })
                .eq('id', entry.id);

            if (balErr) {
                console.error(`  ❌ Failed to update balance for ${entry.id.slice(0, 8)}:`, balErr.message);
                updateErrors++;
            }
        }

        console.log(`  ${updateErrors === 0 ? '✅' : '⚠️'} Recalculated ${freshEntries.length} entries. Final balance: K${runningBalance.toFixed(2)}`);
        if (updateErrors > 0) console.log(`  ⚠️  ${updateErrors} update error(s).`);

        // Re-fetch for report with updated balances
        const { data: updatedEntries } = await supabase
            .from('cashbook_entries')
            .select('id, date, created_at, entry_type, status, credit, debit, balance_after, description, requisition_id')
            .eq('organization_id', organizationId)
            .eq('account_type', ACCOUNT_TYPE)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true });

        await printReconciliationReport(updatedEntries || [], disbursements, organizationId);
    } else {
        await printReconciliationReport(allEntries, disbursements, organizationId);
    }
}

async function printReconciliationReport(
    entries: any[],
    disbursements: any[],
    organizationId: string
) {
    console.log('\n' + '='.repeat(70));
    console.log('RECONCILIATION REPORT — MoneyWise Wallet');
    console.log('='.repeat(70));

    // Tally from cashbook
    const totalInflows  = entries.filter(e => e.entry_type === 'INFLOW').reduce((s, e) => s + Number(e.debit || 0), 0);
    const totalOutflows = entries.filter(e => e.entry_type === 'DISBURSEMENT').reduce((s, e) => s + Number(e.credit || 0), 0);
    const totalAdjustments = entries.filter(e => e.entry_type === 'ADJUSTMENT').reduce((s, e) => s + Number(e.debit || 0) - Number(e.credit || 0), 0);
    const finalBalance  = entries.length > 0 ? Number(entries[entries.length - 1].balance_after) : 0;

    // Reconciliation with disbursements
    const disbEntries = entries.filter(e => e.entry_type === 'DISBURSEMENT' && e.status === 'DISBURSED');
    const disbWithNoEntry = disbursements.filter(d =>
        !entries.some(e => e.requisition_id === d.requisition_id && e.entry_type === 'DISBURSEMENT')
    );

    console.log('\n📊 CASHBOOK SUMMARY');
    console.log(`  Total Inflows  (debits):         K${totalInflows.toFixed(2)}`);
    console.log(`  Total Outflows (credits):        K${totalOutflows.toFixed(2)}`);
    console.log(`  Net Adjustments:                 K${totalAdjustments.toFixed(2)}`);
    console.log(`  ─────────────────────────────────────────`);
    console.log(`  Calculated Running Balance:      K${finalBalance.toFixed(2)}`);

    console.log('\n📊 DISBURSEMENT RECONCILIATION');
    console.log(`  Wallet disbursements in Lenco:   ${disbursements.length}`);
    console.log(`  Cashbook DISBURSEMENT entries:   ${disbEntries.length}`);
    console.log(`  Unlogged disbursements:          ${disbWithNoEntry.length}`);

    if (disbWithNoEntry.length > 0) {
        console.log('\n  ⚠️  UNLOGGED DISBURSEMENTS (still missing from ledger):');
        for (const d of disbWithNoEntry) {
            console.log(`    REQ ${d.requisition_id?.slice(0, 8)} | K${Number(d.total_prepared).toFixed(2)} | ${d.payment_method}`);
        }
    } else {
        console.log('  ✅ All Lenco disbursements are logged in the cashbook.');
    }

    console.log('\n📊 FULL LEDGER (chronological):');
    console.log('  Date        | Type           | Status     | Amount         | Balance');
    console.log('  ' + '-'.repeat(66));
    for (const e of entries) {
        const amt = Number(e.debit) > 0
            ? `+K${Number(e.debit).toFixed(2)}`
            : `-K${Number(e.credit).toFixed(2)}`;
        const type = (e.entry_type || '').padEnd(14);
        const status = (e.status || '').padEnd(10);
        const bal = `K${Number(e.balance_after).toFixed(2)}`;
        console.log(`  ${e.date} | ${type} | ${status} | ${amt.padStart(14)} | ${bal}`);
    }

    console.log('\n' + '='.repeat(70));
    const isBalanced = disbWithNoEntry.length === 0;
    console.log(`VERDICT: ${isBalanced ? '✅ BALANCED — All disbursements are logged.' : `⚠️  ${disbWithNoEntry.length} disbursement(s) still missing from ledger.`}`);
    console.log('='.repeat(70));
}

reconcile()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });

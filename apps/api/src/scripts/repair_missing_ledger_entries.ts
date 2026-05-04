/**
 * repair_missing_ledger_entries.ts
 *
 * ONE-TIME REPAIR SCRIPT: Finds all Lenco/wallet disbursements that were processed
 * successfully but never logged in the cash ledger (cashbook_entries), and creates
 * the missing entries by calling finalizeWalletDisbursementLedger for each one.
 *
 * This is SAFE TO RUN MULTIPLE TIMES — finalizeWalletDisbursementLedger is idempotent
 * and will skip any requisition that already has a 'DISBURSED' cashbook entry.
 *
 * Usage:
 *   npx ts-node src/scripts/repair_missing_ledger_entries.ts
 *
 * Or with dry-run mode (lists affected requisitions without writing anything):
 *   DRY_RUN=true npx ts-node src/scripts/repair_missing_ledger_entries.ts
 */

import { supabase } from '../lib/supabase';
import { cashbookService } from '../services/cashbook.service';
import { LencoService } from '../services/lenco.service';

const DRY_RUN = process.env.DRY_RUN === 'true';

// Default cutoff: 7 days ago. Override with SINCE_DATE env var (YYYY-MM-DD).
const sinceDateOverride = process.env.SINCE_DATE;
const cutoffDate = sinceDateOverride
    ? new Date(sinceDateOverride).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

async function repairMissingLedgerEntries() {
    console.log('='.repeat(60));
    console.log('REPAIR: Missing Wallet Disbursement Ledger Entries');
    console.log(`MODE: ${DRY_RUN ? '🟡 DRY RUN (no writes)' : '🔴 LIVE (will write to DB)'}`);
    console.log(`SINCE: ${cutoffDate.split('T')[0]} (last 7 days only)`);
    console.log('='.repeat(60));

    // Step 1: Find all disbursements that used a Lenco/wallet payment method
    // created within the last 7 days. We join to requisitions to use its updated_at
    // as the date proxy (disbursements table has no created_at column).
    const { data: walletDisbursements, error: disbError } = await supabase
        .from('disbursements')
        .select('id, requisition_id, organization_id, payment_method, external_reference, total_prepared, cashier_id, requisitions!inner(updated_at)')
        .not('external_reference', 'is', null)
        .gte('requisitions.updated_at', cutoffDate);



    if (disbError) {
        console.error('❌ Failed to fetch disbursements:', disbError);
        process.exit(1);
    }

    if (!walletDisbursements || walletDisbursements.length === 0) {
        console.log('✅ No wallet disbursements found. Nothing to repair.');
        process.exit(0);
    }

    console.log(`\nFound ${walletDisbursements.length} wallet disbursement(s) total.\n`);

    // Step 2: For each, check if a cashbook entry with status='DISBURSED' already exists
    let missingCount = 0;
    let repairedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const disb of walletDisbursements) {
        const { data: existingEntry } = await supabase
            .from('cashbook_entries')
            .select('id')
            .eq('requisition_id', disb.requisition_id)
            .eq('status', 'DISBURSED')
            .maybeSingle();

        if (existingEntry) {
            console.log(`  ✅ REQ ${disb.requisition_id.slice(0, 8)} — Ledger entry exists. Skipping.`);
            skippedCount++;
            continue;
        }

        // Missing entry found
        missingCount++;
        console.log(`\n  ⚠️  REQ ${disb.requisition_id.slice(0, 8)} — MISSING ledger entry!`);
        console.log(`     Method: ${disb.payment_method}`);
        console.log(`     Amount: K${Number(disb.total_prepared).toFixed(2)}`);
        console.log(`     Ref:    ${disb.external_reference}`);

        if (DRY_RUN) {
            console.log(`     [DRY RUN] Would call finalizeWalletDisbursementLedger for this requisition.`);
            continue;
        }

        // Step 3: Verify the transaction actually succeeded on Lenco before writing
        try {
            // Fetch org's secret key for Lenco API call
            const { data: org } = await supabase
                .from('organizations')
                .select('lenco_secret_key, payment_test_mode')
                .eq('id', disb.organization_id)
                .single();

            // For simulated (test mode) payments, we trust the record and finalize directly
            const isSimulated = disb.external_reference?.startsWith('SIM-PAY-');

            if (!isSimulated && org?.lenco_secret_key) {
                const lencoStatus = await LencoService.getTransferStatus(
                    disb.external_reference,
                    org.lenco_secret_key
                );

                if (lencoStatus?.status === 'failed') {
                    console.log(`     ❌ SKIPPED: Lenco reports this transfer as FAILED (${disb.external_reference}). No ledger entry created.`);
                    errorCount++;
                    continue;
                }

                if (lencoStatus?.status === 'pending') {
                    console.log(`     ⏳ SKIPPED: Lenco reports this transfer as still PENDING (${disb.external_reference}). Skipping — run again later.`);
                    skippedCount++;
                    continue;
                }

                if (lencoStatus?.status !== 'successful') {
                    console.log(`     ⚠️  SKIPPED: Unknown Lenco status '${lencoStatus?.status}' for ${disb.external_reference}. Skipping for safety.`);
                    skippedCount++;
                    continue;
                }

                console.log(`     ✅ Lenco confirmed: SUCCESSFUL`);
            } else if (isSimulated) {
                console.log(`     ℹ️  Simulated payment — skipping Lenco status check.`);
            }

            // Step 4: Finalize the ledger entry
            await cashbookService.finalizeWalletDisbursementLedger(disb.requisition_id);
            console.log(`     ✅ REPAIRED: Ledger entry created for REQ ${disb.requisition_id.slice(0, 8)}`);
            repairedCount++;

        } catch (err: any) {
            console.error(`     ❌ ERROR repairing REQ ${disb.requisition_id.slice(0, 8)}:`, err?.message);
            errorCount++;
        }

        // Small delay between repairs to avoid overwhelming the DB with balance recalculations
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n' + '='.repeat(60));
    console.log('REPAIR SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Total wallet disbursements found: ${walletDisbursements.length}`);
    console.log(`  Already had ledger entry (skipped): ${skippedCount}`);
    console.log(`  Missing entries found: ${missingCount}`);

    if (!DRY_RUN) {
        console.log(`  Successfully repaired: ${repairedCount}`);
        console.log(`  Errors / could not repair: ${errorCount}`);
    } else {
        console.log(`  [DRY RUN] Would repair: ${missingCount}`);
        console.log(`\n  Run without DRY_RUN=true to apply the repairs.`);
    }

    console.log('='.repeat(60));

    if (!DRY_RUN && repairedCount > 0) {
        console.log('\n⚠️  IMPORTANT: Review the cash ledger in the app to confirm the');
        console.log('   running balance is correct after these new entries were inserted.');
    }
}

repairMissingLedgerEntries()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });

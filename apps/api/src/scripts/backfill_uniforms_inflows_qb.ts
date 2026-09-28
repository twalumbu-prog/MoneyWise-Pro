import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env BEFORE other imports
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import { supabase } from '../lib/supabase';
import { QuickBooksService } from '../services/quickbooks.service';

/**
 * One-off backfill (2026-09-17, owner-approved): classifies all COMPLETED/unclassified
 * INFLOW entries in Twalumbu Education Centre's Uniform Purchases wallet as
 * "Sale of School Uniforms" and posts each as a QuickBooks Deposit.
 *
 * Idempotent: only touches entries whose qb_sync_status isn't already SUCCESS.
 */

const ORG_ID = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
const UNIFORMS_WALLET_ID = 'b946afa4-af1c-425d-8db2-d6ffe02a8eaa';
const INCOME_ACCOUNT_ID = '8f7f22b8-1a04-4a3b-9dfd-b1df819e9959';  // Sale of School Uniforms
const QB_INCOME_ACCOUNT_ID = '57';  // QB-side ID for Sale of School Uniforms

async function main() {
    // Verify the income account is still mapped correctly
    const { data: account } = await supabase
        .from('accounts')
        .select('id, name, qb_account_id')
        .eq('id', INCOME_ACCOUNT_ID)
        .eq('organization_id', ORG_ID)
        .maybeSingle();

    if (!account?.qb_account_id) {
        throw new Error('Sale of School Uniforms account not found or not linked to QuickBooks for Twalumbu');
    }

    console.log(`Income account: "${account.name}" (QB ID: ${account.qb_account_id})`);

    const { data: entries, error } = await supabase
        .from('cashbook_entries')
        .select('id, date, description, debit, reference_number, status, account_id, qb_sync_status')
        .eq('organization_id', ORG_ID)
        .eq('wallet_id', UNIFORMS_WALLET_ID)
        .eq('entry_type', 'INFLOW')
        .neq('qb_sync_status', 'SUCCESS')
        .order('date', { ascending: true });

    if (error) throw error;
    if (!entries || entries.length === 0) {
        console.log('Nothing to backfill.');
        return;
    }

    console.log(`\nFound ${entries.length} entries to process:\n`);
    for (const e of entries) {
        console.log(`  ${e.date}  ${e.reference_number}  K${e.debit}  ${e.description.slice(0, 60)}`);
    }
    console.log('');

    let categorized = 0;
    let posted = 0;
    let failed = 0;

    for (const entry of entries) {
        // Step 1: classify if not already done
        if (entry.account_id !== INCOME_ACCOUNT_ID || entry.status !== 'ACCOUNTED') {
            const { error: catErr } = await supabase
                .from('cashbook_entries')
                .update({ account_id: INCOME_ACCOUNT_ID, status: 'ACCOUNTED' })
                .eq('id', entry.id);
            if (catErr) {
                console.error(`  ❌ classify ${entry.reference_number}: ${catErr.message}`);
                failed++;
                continue;
            }
            categorized++;
        }

        // Step 2: post to QuickBooks
        const result = await QuickBooksService.createDeposit(ORG_ID, entry.id, account.qb_account_id, 'system-backfill');
        if (result.success) {
            posted++;
            console.log(`  ✅ ${entry.date}  ${entry.reference_number}  K${entry.debit} -> QB deposit ${result.qbId}`);
        } else {
            failed++;
            console.error(`  ❌ ${entry.date}  ${entry.reference_number}  K${entry.debit} -> ${JSON.stringify(result.error)}`);
        }
    }

    console.log(`\nDone. Classified ${categorized}, posted to QB: ${posted}, failed: ${failed}.`);
}

main().catch(err => {
    console.error('FAILED', err);
    process.exit(1);
});

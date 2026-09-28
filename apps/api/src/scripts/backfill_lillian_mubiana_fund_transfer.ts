import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import { supabase } from '../lib/supabase';
import { QuickBooksService } from '../services/quickbooks.service';

/**
 * One-off backfill (2026-09-17, owner-approved): classifies all COMPLETED/unclassified
 * "LILLIAN MUBIANA MP..." inflows in Twalumbu's Main wallet as "Fund transfer Control"
 * and posts each as a QuickBooks Deposit.
 *
 * Idempotent: only touches entries whose qb_sync_status isn't already SUCCESS.
 */

const ORG_ID = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
const MAIN_WALLET_ID = '627ed942-fc1f-432e-a3bd-223326ba4311';
const FUND_TRANSFER_ACCOUNT_ID = '44ec3979-3f05-41b0-84dc-d690685b5d8d';  // Fund transfer Control

async function main() {
    const { data: account } = await supabase
        .from('accounts')
        .select('id, name, qb_account_id')
        .eq('id', FUND_TRANSFER_ACCOUNT_ID)
        .eq('organization_id', ORG_ID)
        .maybeSingle();

    if (!account?.qb_account_id) {
        throw new Error('Fund transfer Control account not found or not linked to QuickBooks');
    }

    console.log(`Income account: "${account.name}" (QB ID: ${account.qb_account_id})`);

    const { data: entries, error } = await supabase
        .from('cashbook_entries')
        .select('id, date, description, debit, reference_number, status, account_id, qb_sync_status')
        .eq('organization_id', ORG_ID)
        .eq('wallet_id', MAIN_WALLET_ID)
        .eq('entry_type', 'INFLOW')
        .ilike('description', 'LILLIAN MUBIANA MP%')
        .neq('qb_sync_status', 'SUCCESS')
        .order('date', { ascending: true });

    if (error) throw error;
    if (!entries || entries.length === 0) {
        console.log('Nothing to backfill.');
        return;
    }

    console.log(`\nFound ${entries.length} entries to process:\n`);
    for (const e of entries) {
        console.log(`  ${e.date}  K${e.debit}  ${e.description}`);
    }
    console.log('');

    let categorized = 0;
    let posted = 0;
    let failed = 0;

    for (const entry of entries) {
        if (entry.account_id !== FUND_TRANSFER_ACCOUNT_ID || entry.status !== 'ACCOUNTED') {
            const { error: catErr } = await supabase
                .from('cashbook_entries')
                .update({ account_id: FUND_TRANSFER_ACCOUNT_ID, status: 'ACCOUNTED' })
                .eq('id', entry.id);
            if (catErr) {
                console.error(`  ❌ classify ${entry.description}: ${catErr.message}`);
                failed++;
                continue;
            }
            categorized++;
        }

        const result = await QuickBooksService.createDeposit(ORG_ID, entry.id, account.qb_account_id, 'system-backfill');
        if (result.success) {
            posted++;
            console.log(`  ✅ ${entry.date}  K${entry.debit}  ${entry.description} -> QB deposit ${result.qbId}`);
        } else {
            failed++;
            console.error(`  ❌ ${entry.date}  K${entry.debit}  ${entry.description} -> ${JSON.stringify(result.error)}`);
        }
    }

    console.log(`\nDone. Classified ${categorized}, posted to QB: ${posted}, failed: ${failed}.`);
}

main().catch(err => {
    console.error('FAILED', err);
    process.exit(1);
});

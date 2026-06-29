import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env BEFORE other imports
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import { supabase } from '../lib/supabase';
import { QuickBooksService } from '../services/quickbooks.service';

/**
 * One-off backfill (2026-06-29, owner-approved): clears the backlog of Blue
 * Opus "Split-Inflow Payment - <txnId>" commission credits that predate the
 * fix to isSplitPaymentSweep/categorizeSplitPaymentRevenue in
 * lenco.controller.ts (that narration variant wasn't recognized, so these
 * landed UNACCOUNTED or sat ACCOUNTED-but-never-posted to QuickBooks).
 *
 * Idempotent: only touches entries whose qb_sync_status isn't already
 * SUCCESS, so it's safe to re-run.
 */

const BLUE_OPUS_ORG_ID = 'fa99669d-6160-44fd-94ac-8ff1f065003f';

async function main() {
    const { data: account } = await supabase
        .from('accounts')
        .select('id, qb_account_id')
        .eq('organization_id', BLUE_OPUS_ORG_ID)
        .ilike('name', 'Transaction Service Revenue')
        .maybeSingle();

    if (!account?.qb_account_id) {
        throw new Error('Transaction Service Revenue account not found or not linked to QuickBooks for Blue Opus');
    }

    const { data: entries, error } = await supabase
        .from('cashbook_entries')
        .select('id, description, status, account_id, qb_sync_status')
        .eq('organization_id', BLUE_OPUS_ORG_ID)
        .eq('account_type', 'MONEYWISE_WALLET')
        .ilike('description', '%split-inflow%')
        .neq('qb_sync_status', 'SUCCESS');

    if (error) throw error;
    if (!entries || entries.length === 0) {
        console.log('Nothing to backfill.');
        return;
    }

    console.log(`Found ${entries.length} entries to backfill.`);

    let categorized = 0;
    let posted = 0;
    let failed = 0;

    for (const entry of entries) {
        if (entry.status !== 'ACCOUNTED' || entry.account_id !== account.id) {
            await supabase
                .from('cashbook_entries')
                .update({ account_id: account.id, status: 'ACCOUNTED' })
                .eq('id', entry.id);
            categorized++;
        }

        const result = await QuickBooksService.createDeposit(BLUE_OPUS_ORG_ID, entry.id, account.qb_account_id, 'system-backfill');
        if (result.success) {
            posted++;
            console.log(`  ✅ ${entry.description} -> QB deposit ${result.qbId}`);
        } else {
            failed++;
            console.error(`  ❌ ${entry.description} -> ${JSON.stringify(result.error)}`);
        }
    }

    console.log(`\nDone. Categorized ${categorized}, posted to QB ${posted}, failed ${failed}.`);
}

main().catch(err => {
    console.error('FAILED', err);
    process.exit(1);
});

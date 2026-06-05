import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables before doing anything else
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabase } from '../src/lib/supabase';
import { cashbookService } from '../src/services/cashbook.service';

const fixTransaction = async () => {
    const requisitionId = '112a77b6-f76f-4d9a-9e8d-98fd3671dc8d';
    const orgId = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';

    console.log(`Starting cleanup for Requisition: ${requisitionId}...`);

    // 1. Disable payment_test_mode for organization
    console.log(`Disabling payment_test_mode for Org ${orgId}...`);
    const { error: orgError } = await supabase
        .from('organizations')
        .update({ payment_test_mode: false })
        .eq('id', orgId);
    if (orgError) throw orgError;
    console.log('✅ payment_test_mode disabled.');

    // 2. Delete messages
    console.log('Deleting messages related to disbursement and expense stages...');
    const { data: messages } = await supabase
        .from('requisition_messages')
        .select('id, metadata')
        .eq('requisition_id', requisitionId);

    if (messages) {
        const messageIdsToDelete = messages
            .filter(m => m.metadata && ['DISBURSAL_SUCCESS', 'EXPENSE_TRACKING', 'EXPENSE_SUMMARY'].includes((m.metadata as any).stage))
            .map(m => m.id);

        if (messageIdsToDelete.length > 0) {
            const { error: msgDelError } = await supabase
                .from('requisition_messages')
                .delete()
                .in('id', messageIdsToDelete);
            if (msgDelError) throw msgDelError;
            console.log(`✅ Deleted ${messageIdsToDelete.length} message cards.`);
        } else {
            console.log('No message cards found to delete.');
        }
    }

    // 3. Delete cashbook entry and recalculate
    console.log('Deleting cashbook entry and recalculating balances...');
    const { data: ledgerEntry } = await supabase
        .from('cashbook_entries')
        .select('date, created_at, account_type')
        .eq('requisition_id', requisitionId)
        .maybeSingle();

    if (ledgerEntry) {
        const { error: ledgerDelError } = await supabase
            .from('cashbook_entries')
            .delete()
            .eq('requisition_id', requisitionId);
        if (ledgerDelError) throw ledgerDelError;
        console.log('✅ Cashbook entry deleted.');

        await cashbookService.recalculateBalancesFrom(
            orgId,
            ledgerEntry.date,
            ledgerEntry.created_at,
            ledgerEntry.account_type || 'MONEYWISE_WALLET'
        );
        console.log('✅ Balances recalculated.');
    } else {
        console.log('No cashbook entry found.');
    }

    // 4. Delete disbursement record
    console.log('Deleting disbursement record...');
    const { error: disbError } = await supabase
        .from('disbursements')
        .delete()
        .eq('requisition_id', requisitionId);
    if (disbError) throw disbError;
    console.log('✅ Disbursement record deleted.');

    // 5. Revert Requisition to AUTHORISED
    console.log('Reverting Requisition to AUTHORISED...');
    const { error: reqUpdateError } = await supabase
        .from('requisitions')
        .update({
            status: 'AUTHORISED',
            actual_total: null,
            updated_at: new Date().toISOString()
        })
        .eq('id', requisitionId);
    if (reqUpdateError) throw reqUpdateError;
    console.log('✅ Requisition reverted to AUTHORISED.');

    console.log('All repair steps finished successfully.');
    process.exit(0);
};

fixTransaction().catch(err => {
    console.error('Fatal repair error:', err);
    process.exit(1);
});

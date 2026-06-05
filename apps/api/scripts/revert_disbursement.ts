import dotenv from 'dotenv';
import path from 'path';
import { supabase } from '../src/lib/supabase';
import { cashbookService } from '../src/services/cashbook.service';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function revert() {
    const requisitionId = '81115dd6-facc-4afd-ba9e-e165579034db';
    const organizationId = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
    const paymentMethod = 'MONEYWISE_WALLET';

    console.log(`Reverting disbursement for Requisition: ${requisitionId}...`);

    try {
        // A. Revert Requisition to AUTHORISED
        const { error: reqError } = await supabase
            .from('requisitions')
            .update({ 
                status: 'AUTHORISED', 
                actual_total: null,
                updated_at: new Date().toISOString() 
            })
            .eq('id', requisitionId);

        if (reqError) {
            console.error('Failed to update requisition status:', reqError);
            return;
        }
        console.log('1. Reverted requisition status to AUTHORISED.');

        // B. Delete any disbursement record
        const { error: disbError } = await supabase
            .from('disbursements')
            .delete()
            .eq('requisition_id', requisitionId);

        if (disbError) {
            console.error('Failed to delete disbursement record:', disbError);
            return;
        }
        console.log('2. Deleted disbursement record.');

        // C. Delete cashbook entries and recalculate
        const { data: ledgerEntry, error: ledgerFetchError } = await supabase
            .from('cashbook_entries')
            .select('date, created_at, account_type')
            .eq('requisition_id', requisitionId)
            .maybeSingle();

        if (ledgerFetchError) {
            console.error('Error checking ledger entry:', ledgerFetchError);
        } else if (ledgerEntry) {
            const { error: ledgerDeleteError } = await supabase
                .from('cashbook_entries')
                .delete()
                .eq('requisition_id', requisitionId);

            if (ledgerDeleteError) {
                console.error('Failed to delete ledger entry:', ledgerDeleteError);
                return;
            }
            console.log('3. Deleted cashbook entries.');

            console.log('4. Recalculating balances starting from point of deletion...');
            await cashbookService.recalculateBalancesFrom(
                organizationId, 
                ledgerEntry.date, 
                ledgerEntry.created_at,
                ledgerEntry.account_type || paymentMethod
            );
            console.log('5. Balances recalculated.');
        } else {
            console.log('3. No cashbook entries found for this requisition (expected for pending wallet transfer).');
        }

        // D. Delete messages related to disbursement and expense tracking
        const { data: messages, error: messagesError } = await supabase
            .from('requisition_messages')
            .select('id, metadata')
            .eq('requisition_id', requisitionId);

        if (messagesError) {
            console.error('Error fetching requisition messages:', messagesError);
        } else if (messages) {
            const messageIdsToDelete = messages
                .filter(m => m.metadata && ['DISBURSAL_SUCCESS', 'EXPENSE_TRACKING', 'EXPENSE_SUMMARY'].includes((m.metadata as any).stage))
                .map(m => m.id);

            if (messageIdsToDelete.length > 0) {
                const { error: msgDeleteError } = await supabase
                    .from('requisition_messages')
                    .delete()
                    .in('id', messageIdsToDelete);

                if (msgDeleteError) {
                    console.error('Failed to delete messages:', msgDeleteError);
                } else {
                    console.log(`6. Deleted ${messageIdsToDelete.length} related requisition messages.`);
                }
            } else {
                console.log('6. No related requisition messages found to delete.');
            }
        }

        // E. Log audit log
        const { error: auditError } = await supabase
            .from('audit_logs')
            .insert({
                entity_type: 'REQUISITION',
                entity_id: requisitionId,
                action: 'TRANSFER_FAILED',
                changes: { reverted_to: 'AUTHORISED', reason: 'User requested revert as money was not actually disbursed in Lenco' }
            });

        if (auditError) {
            console.error('Failed to insert audit log:', auditError);
        } else {
            console.log('7. Audit log inserted.');
        }

        console.log('\n✅ Revert completed successfully!');
    } catch (err) {
        console.error('Unexpected error during revert:', err);
    }
}

revert();

import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables before doing anything else
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabase } from '../src/lib/supabase';
import { cashbookService } from '../src/services/cashbook.service';

const deleteRequisition = async () => {
    const requisitionId = 'd8458ad2-d0ec-46c2-a389-70ab3c4c59ae';
    const orgId = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';

    console.log(`Starting deletion for Requisition: ${requisitionId}...`);

    // 1. Delete messages
    console.log('Deleting messages...');
    const { error: msgError } = await supabase
        .from('requisition_messages')
        .delete()
        .eq('requisition_id', requisitionId);
    if (msgError) throw msgError;
    console.log('✅ Messages deleted.');

    // 2. Delete disbursements
    console.log('Deleting disbursements...');
    const { error: disbError } = await supabase
        .from('disbursements')
        .delete()
        .eq('requisition_id', requisitionId);
    if (disbError) throw disbError;
    console.log('✅ Disbursements deleted.');

    // 3. Delete cashbook entries and recalculate
    console.log('Deleting cashbook entry...');
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

        console.log('Recalculating ledger balances...');
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

    // 4. Delete line items
    console.log('Deleting line items...');
    const { error: lineItemsError } = await supabase
        .from('line_items')
        .delete()
        .eq('requisition_id', requisitionId);
    if (lineItemsError) throw lineItemsError;
    console.log('✅ Line items deleted.');

    // 5. Delete audit logs referencing this requisition
    console.log('Deleting audit logs...');
    const { error: auditError } = await supabase
        .from('audit_logs')
        .delete()
        .eq('entity_id', requisitionId);
    if (auditError) throw auditError;
    console.log('✅ Audit logs deleted.');

    // 6. Delete requisition
    console.log('Deleting requisition...');
    const { error: reqError } = await supabase
        .from('requisitions')
        .delete()
        .eq('id', requisitionId);
    if (reqError) throw reqError;
    console.log('✅ Requisition deleted.');

    console.log('All deletion steps completed successfully.');
    process.exit(0);
};

deleteRequisition().catch(err => {
    console.error('Fatal deletion error:', err);
    process.exit(1);
});

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabase } from '../src/lib/supabase';
import { handleCollectionSuccessful } from '../src/controllers/lenco.webhook.controller';

// The failed CHG transaction reference from the user's console logs
const REFERENCE = 'CHG-1773937903615-df2ff8c6-eebf-4e53-923e-986c970e6794-3e40720c';
const TRANSACTION_ID = '35334fbf-f2a4-4ff1-8711-69d9e322d024';
const ORGANIZATION_ID = 'e8347baa-b9ba-40a2-a319-3618d5e716e0';

async function fixMissedCollection() {
    console.log('Checking for existing ledger entry...');

    // Check if already logged
    const { data: existing } = await supabase
        .from('cashbook_entries')
        .select('id, description, debit')
        .like('description', `%${REFERENCE}%`)
        .maybeSingle();

    if (existing) {
        console.log(`✅ Already logged: ${existing.id} — K${existing.debit}`);
        process.exit(0);
    }

    console.log('Not found. Fetching transaction from Lenco to determine amount...');

    // We need to reconstruct the transaction data.
    // The reference is CHG-{timestamp}-{req_uuid}-{short}, which is a change collection.
    // Extract the requisition ID UUID from the reference
    const uuidMatch = REFERENCE.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    const reqId = uuidMatch ? uuidMatch[0] : null;
    console.log(`Requisition ID from reference: ${reqId}`);

    // Get the amount from the disbursement record
    let amount = 0;
    if (reqId) {
        const { data: disb } = await supabase
            .from('disbursements')
            .select('actual_change_amount, confirmed_change_amount, total_prepared')
            .eq('requisition_id', reqId)
            .maybeSingle();

        console.log('Disbursement data:', disb);
        amount = disb?.confirmed_change_amount || disb?.actual_change_amount || 0;
    }

    if (!amount) {
        console.error('❌ Could not determine amount. Please check disbursement record manually.');
        process.exit(1);
    }

    console.log(`Logging collection of K${amount} for ${REFERENCE}...`);

    const success = await handleCollectionSuccessful({
        reference: REFERENCE,
        amount: amount.toString(),
        accountId: null,
    }, ORGANIZATION_ID);

    if (success) {
        console.log('✅ Successfully logged the missed CHG collection!');
    } else {
        console.error('❌ Failed to log the collection.');
    }

    process.exit(0);
}

fixMissedCollection().catch(err => {
    console.error('Script error:', err);
    process.exit(1);
});

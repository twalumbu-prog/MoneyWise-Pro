
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testUpdate() {
    try {
        // Find a requisition that is RECEIVED and has a disbursement
        const { data: recers, error: recError } = await supabase
            .from('requisitions')
            .select('id, disbursements(id)')
            .eq('status', 'RECEIVED')
            .limit(1);

        if (recError || !recers || recers.length === 0) {
            console.log('No RECEIVED requisitions found for testing.');
            return;
        }

        const id = recers[0].id;
        console.log(`Testing update for Requisition ID: ${id}`);

        const denominations = [
            { value: 100, count: 1 },
            { value: 50, count: 0 }
        ];
        const change_amount = 100;

        console.log('Updating disbursements table...');
        const { data, error } = await supabase
            .from('disbursements')
            .update({
                returned_denominations: denominations,
                actual_change_amount: change_amount
            })
            .eq('requisition_id', id)
            .select();

        if (error) {
            console.error('Update FAILED:', error);
        } else {
            console.log('Update SUCCESSFUL. Row count:', data?.length);
            console.log('Returned data:', data);
        }

        console.log('Updating requisition status...');
        const { error: statusError } = await supabase
            .from('requisitions')
            .update({ status: 'CHANGE_SUBMITTED' })
            .eq('id', id)
            .select();

        if (statusError) {
            console.error('Status update FAILED:', statusError);
        } else {
            console.log('Status update SUCCESSFUL.');
        }

    } catch (err) {
        console.error('Test script error:', err);
    }
}

testUpdate();

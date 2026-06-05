import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkReq() {
    try {
        console.log('Querying all requisitions...');
        const { data: allReqs, error } = await supabase
            .from('requisitions')
            .select('*');

        if (error) {
            console.error('Error fetching requisitions:', error);
            return;
        }

        const reqs = allReqs?.filter(r => r.id.toLowerCase().startsWith('81115dd6'));
        console.log('Matches:', reqs);

        if (reqs && reqs.length > 0) {
            const req = reqs[0];
            console.log('\n--- Requisition details ---');
            console.log(JSON.stringify(req, null, 2));

            console.log('\n--- Disbursements for this Requisition ---');
            const { data: disbursements, error: disbError } = await supabase
                .from('disbursements')
                .select('*')
                .eq('requisition_id', req.id);
            
            if (disbError) {
                console.error('Error fetching disbursements:', disbError);
            } else {
                console.table(disbursements);
            }

            console.log('\n--- Cashbook Entries for this Requisition ---');
            const { data: cashbook, error: cashbookError } = await supabase
                .from('cashbook_entries')
                .select('*')
                .eq('requisition_id', req.id);

            if (cashbookError) {
                console.error('Error fetching cashbook entries:', cashbookError);
            } else {
                console.table(cashbook);
            }
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

checkReq();

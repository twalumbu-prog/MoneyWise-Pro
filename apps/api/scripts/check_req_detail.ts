import { supabase } from '../src/lib/supabase';

async function main() {
    console.log('Fetching REQ-5C41FB59 details...');
    const { data: req, error } = await supabase
        .from('requisitions')
        .select('id, status, estimated_total, actual_total, requestor_id, created_at, disbursements(*), requisition_messages(*)')
        .eq('id', '5c41fb59-b4ad-4027-b78c-9e8b286b6594')
        .single();

    if (error) {
        console.error('Error fetching req:', error);
        return;
    }

    console.log('Disbursements:', JSON.stringify(req.disbursements, null, 2));
    console.log('Messages:', JSON.stringify(req.requisition_messages, null, 2));
    console.log('Status:', req.status);
}

main();

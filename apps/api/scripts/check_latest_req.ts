import { supabase } from '../src/lib/supabase';

async function main() {
    console.log('Fetching latest requisitions...');
    const { data: reqs, error } = await supabase
        .from('requisitions')
        .select('id, status, estimated_total, actual_total, requestor_id, created_at, disbursements(*)')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(JSON.stringify(reqs, null, 2));
}

main();

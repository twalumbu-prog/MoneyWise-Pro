import { supabase } from '../src/lib/supabase';

async function main() {
    console.log('Checking vouchers for req 5c41fb59-b4ad-4027-b78c-9e8b286b6594...');
    const { data: vouchers, error } = await supabase
        .from('vouchers')
        .select('*')
        .eq('requisition_id', '5c41fb59-b4ad-4027-b78c-9e8b286b6594');

    if (error) {
        console.error('Error fetching vouchers:', error);
        return;
    }

    console.log('Existing Vouchers:', JSON.stringify(vouchers, null, 2));
}

main();

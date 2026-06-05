import { supabase } from '../src/lib/supabase';

async function main() {
    console.log('Testing duplicate voucher insert...');
    const { data, error } = await supabase
        .from('vouchers')
        .insert({
            requisition_id: '5c41fb59-b4ad-4027-b78c-9e8b286b6594',
            organization_id: 'e359c84e-b42b-4b0a-b422-a2074d87d83a',
            created_by: '54de28ee-d913-408f-837f-0adfcda179d1',
            reference_number: 'PV-REQ-2026-0154',
            total_credit: 366,
            total_debit: 366,
            status: 'DRAFT'
        });

    console.log('Insert Result:', { data, error });
}

main();

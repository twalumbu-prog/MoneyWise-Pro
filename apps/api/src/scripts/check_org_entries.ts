import { supabase } from '../lib/supabase';

async function main() {
    const personalOrgId = 'c57c7c11-d5d0-4855-95e1-eef3745563b9';
    const userId = '215d63dc-8f4a-4993-a6a5-100ad44b4c1d';

    console.log('--- Checking Requisitions for Personal Org ---');
    const { data: reqsInPersonal } = await supabase
        .from('requisitions')
        .select('id, description, estimated_total, organization_id, status, type, created_at')
        .eq('organization_id', personalOrgId);
    console.log(`Requisitions with org_id = ${personalOrgId}:`, reqsInPersonal);

    console.log('\n--- Checking Cashbook Entries for Personal Org ---');
    const { data: cbInPersonal } = await supabase
        .from('cashbook_entries')
        .select('id, description, debit, credit, organization_id, entry_type, created_at')
        .eq('organization_id', personalOrgId);
    console.log(`Cashbook entries with org_id = ${personalOrgId}:`, cbInPersonal);

    console.log('\n--- Checking Cashbook Entries created by user in other orgs ---');
    const { data: cbByUser } = await supabase
        .from('cashbook_entries')
        .select('id, description, debit, credit, organization_id, entry_type, created_at')
        .eq('created_by', userId)
        .limit(10);
    console.log(`Recent cashbook entries created by user:`, cbByUser);

    console.log('\n--- Checking Requisitions created by user in other orgs ---');
    const { data: reqsByUser } = await supabase
        .from('requisitions')
        .select('id, description, estimated_total, organization_id, status, type, created_at')
        .eq('requestor_id', userId)
        .limit(10);
    console.log(`Recent requisitions created by user:`, reqsByUser);
}

main().catch(console.error);

import { supabase } from '../lib/supabase';

async function resetAndSetOpeningBalance() {
    console.log('🔄 Cleaning up cashbook_entries...');

    // 1. Delete all existing entries
    const { error: deleteError } = await supabase
        .from('cashbook_entries')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
        console.error('Error deleting entries:', deleteError);
        return;
    }

    // 2. Find a valid user to assign as creator (prefer ADMIN or CASHIER)
    const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, name, role')
        .in('role', ['ADMIN', 'CASHIER'])
        .limit(1);

    const creatorId = users && users.length > 0 ? users[0].id : null;
    const creatorName = users && users.length > 0 ? users[0].name : 'System';

    console.log(`👤 Using creator: ${creatorName} (${creatorId})`);

    // 3. Insert new opening balance with today's date
    const today = new Date().toISOString().split('T')[0];
    const amount = 10000;

    const { data, error: insertError } = await supabase
        .from('cashbook_entries')
        .insert({
            date: today,
            description: 'Opening Balance (Initial Setup)',
            debit: amount,
            credit: 0,
            balance_after: amount,
            entry_type: 'OPENING_BALANCE',
            created_by: creatorId
        })
        .select();

    if (insertError) {
        console.error('Error inserting opening balance:', insertError);
        return;
    }

    console.log('✅ Successfully reset cashbook with opening balance:', data);
}

resetAndSetOpeningBalance();

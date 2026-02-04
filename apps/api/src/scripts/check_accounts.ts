import { supabase } from '../lib/supabase';

async function checkAccounts() {
    const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('is_active', true);

    if (error) {
        console.error('Error fetching accounts:', error);
        return;
    }

    console.log('Total accounts:', data?.length);
    console.log('Accounts:', data);
}

checkAccounts().then(() => process.exit(0));

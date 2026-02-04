import { supabase } from '../lib/supabase';

async function checkBalance() {
    const { data, error } = await supabase
        .from('cashbook_entries')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Current Entries:', data);
}

checkBalance();

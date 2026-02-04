import { supabase } from '../lib/supabase';

async function checkData() {
    console.log('--- REQUISITIONS ---');
    const { data: requisitions, error: reqError } = await supabase
        .from('requisitions')
        .select('id, description, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (reqError) console.error('Error fetching requisitions:', reqError);
    else console.table(requisitions);

    console.log('\n--- USERS ---');
    const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, name, email, role')
        .order('created_at', { ascending: false })
        .limit(5);

    if (userError) console.error('Error fetching users:', userError);
    else console.table(users);
}

checkData();

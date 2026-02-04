
require('dotenv').config({ path: 'apps/api/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TARGET_USER_ID = '112c0b9a-b48b-4a5a-aa95-43942f269b08';

async function setAccountantRole() {
    console.log(`Updating user ${TARGET_USER_ID} to ACCOUNTANT...`);

    // Updates the public.users table
    const { data, error } = await supabase
        .from('users')
        .update({ role: 'ACCOUNTANT' })
        .eq('id', TARGET_USER_ID)
        .select();

    if (error) {
        console.error('Error updating role:', error);
    } else {
        console.log('✅ Success! User updated:', data);
    }
}

setAccountantRole();

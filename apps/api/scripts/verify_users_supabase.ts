
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkUsersTable() {
    try {
        console.log('Fetching users from public.users...');
        const { data, error } = await supabase
            .from('users')
            .select('*');

        if (error) {
            console.error('Error fetching users:', error);
        } else {
            console.log(`Found ${data.length} users:`);
            console.table(data);
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

checkUsersTable();

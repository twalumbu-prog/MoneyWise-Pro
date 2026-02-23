import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load from apps/api/.env
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function run() {
    console.log('Finding user by email...');
    const email = 'masterfees101@gmail.com';

    // Get user id from public.users
    const { data: user, error: userError } = await supabase.from('users').select('id, email, status').eq('email', email).single();

    if (user) {
        console.log('Found user in public.users:', user.id, 'Status:', user.status);

        console.log('Deleting from public.users...');
        const { error: dbDel } = await supabase.from('users').delete().eq('id', user.id);
        if (dbDel) console.error('Error deleting from public.users:', dbDel);
        else console.log('Deleted from public.users');

        console.log('Deleting from auth.users...');
        const { error: authDel } = await (supabase.auth as any).admin.deleteUser(user.id);
        if (authDel) console.error('Error deleting from auth.users:', authDel);
        else console.log('Deleted from auth.users');
    } else {
        console.log('User not found in public.users:', userError?.message);
    }

    // Check auth directly just in case public user was missing
    console.log('\nChecking via auth API for the email...');
    const { data: usersData, error: usersError } = await (supabase.auth as any).admin.listUsers();

    if (usersError) {
        console.error('Error listing auth users:', usersError);
        return;
    }

    const targetUser = usersData.users.find((u: any) => u.email === email);
    if (targetUser) {
        console.log('Found user in auth.users by list:', targetUser.id);
        console.log('Deleting from auth.users...');
        const { error: authDel } = await (supabase.auth as any).admin.deleteUser(targetUser.id);
        if (authDel) console.error('Error deleting from auth.users:', authDel);
        else console.log('Deleted from auth.users');
    } else {
        console.log('User not found in auth.users list.');
    }
}

run();

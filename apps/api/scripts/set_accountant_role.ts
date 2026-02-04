import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from apps/api/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/api/.env');
    console.error('');
    console.error('Please add the following to apps/api/.env:');
    console.error('  SUPABASE_URL=https://klfeluphcutgppkhaxyl.supabase.co');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>');
    console.error('');
    console.error('Get your service role key from:');
    console.error('  Supabase Dashboard → Settings → API → service_role key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

async function setAccountantRole() {
    const email = 'testuser_verified@example.com';

    console.log(`🔍 Looking for user: ${email}...`);

    try {
        // Get the user from auth.users
        const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();

        if (listError) {
            console.error('❌ Error listing users:', listError.message);
            process.exit(1);
        }

        const authUser = authUsers.users.find(u => u.email === email);

        if (!authUser) {
            console.error(`❌ User not found in auth.users: ${email}`);
            console.error('Please create the user first using create_test_user.ts');
            process.exit(1);
        }

        console.log(`✅ Found user in auth.users: ${authUser.id}`);

        // Check if user exists in public.users
        const { data: publicUser, error: selectError } = await supabase
            .from('users')
            .select('*')
            .eq('id', authUser.id)
            .single();

        if (selectError && selectError.code !== 'PGRST116') {
            console.error('❌ Error checking public.users:', selectError.message);
            process.exit(1);
        }

        if (!publicUser) {
            console.log('📝 User not found in public.users, creating...');

            // Insert the user into public.users
            const { error: insertError } = await supabase
                .from('users')
                .insert({
                    id: authUser.id,
                    email: authUser.email,
                    name: authUser.user_metadata?.full_name || 'Test User',
                    role: 'ACCOUNTANT',
                    employee_id: null, // Make it nullable as per migration
                });

            if (insertError) {
                console.error('❌ Error inserting user:', insertError.message);
                process.exit(1);
            }

            console.log('✅ User created in public.users with ACCOUNTANT role');
        } else {
            console.log(`📝 User exists in public.users with role: ${publicUser.role}`);

            if (publicUser.role === 'ACCOUNTANT') {
                console.log('✅ User already has ACCOUNTANT role');
            } else {
                // Update the role
                const { error: updateError } = await supabase
                    .from('users')
                    .update({ role: 'ACCOUNTANT' })
                    .eq('id', authUser.id);

                if (updateError) {
                    console.error('❌ Error updating role:', updateError.message);
                    process.exit(1);
                }

                console.log('✅ User role updated to ACCOUNTANT');
            }
        }

        // Verify the final state
        const { data: verifyUser } = await supabase
            .from('users')
            .select('id, email, name, role')
            .eq('id', authUser.id)
            .single();

        console.log('');
        console.log('✅ Final user state:');
        console.log('  ID:', verifyUser?.id);
        console.log('  Email:', verifyUser?.email);
        console.log('  Name:', verifyUser?.name);
        console.log('  Role:', verifyUser?.role);
        console.log('');
        console.log('🎉 Done! The user can now access the accountant view.');

    } catch (error) {
        console.error('❌ Unexpected error:', error);
        process.exit(1);
    }
}

setAccountantRole();

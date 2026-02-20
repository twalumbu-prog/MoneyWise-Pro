import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load directly from apps/api/.env
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase credentials in .env');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function runTests() {
    console.log('Testing User Invitation Edge Cases...');
    const testEmail = `antigravity.edge.invite.${Date.now()}@gmail.com`;
    const testName = 'Test Edge Invite';
    const testRole = 'REQUESTOR';

    // Use the first org ID found
    const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
    const orgId = orgs?.[0]?.id;

    if (!orgId) {
        throw new Error('No organizations found for testing');
    }

    try {
        // 1. Send Initial Invite
        console.log(`\n1. Inviting ${testEmail}...`);
        const { data: authData, error: authError } = await (supabase.auth as any).admin.inviteUserByEmail(testEmail, {
            data: {
                name: testName,
                role: testRole,
                organization_id: orgId,
                employee_id: `EMP-EDGE-${Date.now()}`,
                username: null,
                status: 'INVITED',
                full_name: testName
            },
            redirectTo: `http://localhost:5173/join`,
        });

        if (authError) throw authError;
        const userId = authData.user?.id;
        console.log('✔ Initial Auth Invitation sent successfully. User ID:', userId);

        // Wait a small moment for trigger to run
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Ensure user is inserted into public.users with INVITED status (mimicking controller)
        const { error: dbUpsertError } = await supabase.from('users').upsert({
            id: userId,
            email: testEmail,
            name: testName,
            role: testRole,
            employee_id: `EMP-EDGE-${Date.now()}`,
            organization_id: orgId,
            status: 'INVITED'
        });
        if (dbUpsertError) throw dbUpsertError;
        console.log('✔ Public User record initialized/upserted');

        // 2. Resend Invite (replicating updated controller logic)
        console.log('\n2. Testing Resend Invite logic...');
        // First delete
        const { error: dbDelError } = await supabase.from('users').delete().eq('id', userId);
        if (dbDelError) throw dbDelError;
        await (supabase.auth as any).admin.deleteUser(userId);

        const { data: resendData, error: resendError } = await (supabase.auth as any).admin.inviteUserByEmail(testEmail, {
            data: {
                name: testName,
                role: testRole,
                organization_id: orgId,
                employee_id: `EMP-EDGE-RESEND-${Date.now()}`,
                username: null,
                status: 'INVITED',
                full_name: testName
            },
            redirectTo: `http://localhost:5173/join`,
        });

        if (resendError) throw resendError;
        const newUserId = resendData.user?.id;
        console.log('✔ Resend Invitation (new user created) sent successfully without error. New ID:', newUserId);

        await new Promise(resolve => setTimeout(resolve, 1500));

        // 3. Test Hard Delete Logic (simulating deleteUser controller)
        console.log('\n3. Testing Hard Delete for resent INVITED user...');
        const { data: targetUser } = await supabase.from('users').select('status').eq('id', newUserId).single();
        if (targetUser?.status === 'INVITED') {
            console.log('User status is INVITED, hard deleting...');
            const { error: dbDeleteError } = await supabase.from('users').delete().eq('id', newUserId);
            if (dbDeleteError) throw dbDeleteError;

            const { error: authDeleteError } = await (supabase.auth as any).admin.deleteUser(newUserId);
            if (authDeleteError) throw authDeleteError;
            console.log('✔ User hard deleted from public.users and auth.users successfully.');

            // Verify they are really gone
            const { data: checkDb } = await supabase.from('users').select('id').eq('id', newUserId).single();
            if (!checkDb) console.log('✔ Verified: User not in public.users');
        } else {
            console.log('❌ User status was not INVITED. Found:', targetUser?.status);
        }

    } catch (e) {
        console.error('\n❌ Test failed:', e);
    }
}

runTests();

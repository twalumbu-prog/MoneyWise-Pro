import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspect() {
    try {
        console.log('--- PUBLIC.USERS ---');
        const { data: publicUsers, error: publicError } = await supabase
            .from('users')
            .select('id, email, name, organization_id, status');
        if (publicError) {
            console.error('Error fetching public users:', publicError);
        } else {
            console.table(publicUsers);
        }

        console.log('\n--- AUTH.USERS ---');
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        if (authError) {
            console.error('Error fetching auth users:', authError);
        } else {
            const formatted = authUsers.users.map((u: any) => ({
                id: u.id,
                email: u.email,
                created_at: u.created_at,
                last_sign_in_at: u.last_sign_in_at
            }));
            console.table(formatted);
        }

        console.log('\n--- USER_ORGANIZATIONS ---');
        const { data: userOrgs, error: userOrgsError } = await supabase
            .from('user_organizations')
            .select('id, user_id, organization_id, role, status');
        if (userOrgsError) {
            console.error('Error fetching user_organizations:', userOrgsError);
        } else {
            console.table(userOrgs);
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

inspect();

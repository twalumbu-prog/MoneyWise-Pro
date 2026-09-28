import { supabase } from '../lib/supabase';

async function main() {
    console.log('--- Querying smkapambwe9@gmail.com ---');
    const { data: users, error: uError } = await supabase
        .from('users')
        .select('*')
        .ilike('email', '%smkapambwe9@gmail.com%');

    console.log('Users found:', users, 'Error:', uError);

    if (users && users.length > 0) {
        for (const u of users) {
            console.log(`\nUser: ${u.id}, name: ${u.name}, current org_id: ${u.organization_id}`);
            
            // User orgs
            const { data: userOrgs } = await supabase
                .from('user_organizations')
                .select('*, organization:organizations(*)')
                .eq('user_id', u.id);
            console.log('User organizations:', JSON.stringify(userOrgs, null, 2));

            // Accounts in current org
            if (u.organization_id) {
                const { data: accounts } = await supabase
                    .from('accounts')
                    .select('*')
                    .eq('organization_id', u.organization_id);
                console.log(`Accounts in user's current org (${u.organization_id}):`, accounts?.map(a => `${a.code} - ${a.name} (${a.type})`));
            }
        }
    }

    // Also search all organizations with stephen or workspace or smkapambwe
    console.log('\n--- Searching Organizations ---');
    const { data: orgs } = await supabase
        .from('organizations')
        .select('*')
        .or('name.ilike.%stephen%,name.ilike.%workspace%,name.ilike.%personal%');
    console.log('Orgs matching:', orgs);
}

main().catch(console.error);

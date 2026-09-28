import { supabase } from '../lib/supabase';
import { seedPersonalAccounts } from '../services/account-provisioning.service';

async function main() {
    console.log('--- Cleaning personal workspaces accounts in DB ---');
    
    // Find all personal workspaces
    const { data: orgs, error } = await supabase
        .from('organizations')
        .select('id, name');

    if (error || !orgs) {
        console.error('Error fetching orgs:', error);
        return;
    }

    for (const org of orgs) {
        const lower = (org.name || '').toLowerCase();
        const isPersonal = lower.includes('workspace') || lower.includes('personal') || lower.includes('individual');
        if (isPersonal) {
            console.log(`\nCleaning accounts for personal org: ${org.name} (${org.id})...`);
            
            // Delete all business accounts for this personal org
            const { error: delError } = await supabase
                .from('accounts')
                .delete()
                .eq('organization_id', org.id)
                .in('code', ['4010', '4020', '5010', '5020', '6010', '6020', '6030', '6040', '6050', '6060', '6070', '6080', '6090', '6100', '6110', '6120', '7010', '7020', '8010']);

            if (delError) console.error('Del error:', delError);

            // Seed clean personal chart of accounts
            await seedPersonalAccounts(org.id);

            // Verify accounts
            const { data: finalAccounts } = await supabase
                .from('accounts')
                .select('code, name, type')
                .eq('organization_id', org.id)
                .order('code', { ascending: true });

            console.log(`New clean accounts (${finalAccounts?.length}):`, finalAccounts);
        }
    }
}

main().catch(console.error);

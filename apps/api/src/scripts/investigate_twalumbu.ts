import { supabase } from '../lib/supabase';

async function main() {
    // 1. Find Twalumbu Education Centre
    const { data: orgs, error: orgErr } = await supabase
        .from('organizations')
        .select('id, name')
        .ilike('name', '%twalumbu%');
    
    if (orgErr) {
        console.error('Error fetching org:', orgErr);
        return;
    }
    console.log('Organizations found:', orgs);
    if (!orgs || orgs.length === 0) return;

    for (const org of orgs) {
        console.log(`\n=== Checking org ${org.name} (${org.id}) ===`);
        
        // 2. Fetch wallets
        const { data: wallets, error: wErr } = await supabase
            .from('wallets')
            .select('*')
            .eq('organization_id', org.id);
        console.log('Wallets:', wallets?.map(w => ({ id: w.id, name: w.name, balance: w.balance, is_main: w.is_main })));

        // 3. Fetch latest 25 cashbook entries
        const { data: entries, error: eErr } = await supabase
            .from('cashbook_entries')
            .select('id, date, created_at, account_type, wallet_id, debit, credit, balance_after, status, description, reference, source_type')
            .eq('organization_id', org.id)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(25);

        if (eErr) {
            console.error('Error fetching entries:', eErr);
            continue;
        }

        console.log(`\nLatest ${entries?.length} entries for ${org.name}:`);
        for (const e of entries || []) {
            console.log(`ID: ${e.id} | Date: ${e.date} | Created: ${e.created_at} | Wallet: ${e.wallet_id} | In: ${e.debit} | Out: ${e.credit} | BalAfter: ${e.balance_after} | Stat: ${e.status} | Ref: ${e.reference} | Desc: ${e.description}`);
        }
    }
}

main().catch(console.error);

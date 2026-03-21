import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { supabase } from '../src/lib/supabase';

async function run() {
    const { data: orgs, error } = await supabase
        .from('organizations')
        .select('id, name, lenco_subaccount_id, lenco_public_key, lenco_secret_key');
    
    if (error) {
        console.error('Error fetching orgs:', error);
        return;
    }

    console.log('--- Lenco Configs across Organizations ---');
    orgs?.forEach(o => {
        console.log(`${o.id.slice(0, 8)} | ${o.name.padEnd(25)} | Subaccount: ${o.lenco_subaccount_id || 'NULL'} | PubKey: ${o.lenco_public_key ? 'EXISTS' : 'NULL'} | SecKey: ${o.lenco_secret_key ? 'EXISTS' : 'NULL'}`);
    });
}
run();

import { LencoService } from '../src/services/lenco.service';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLenco() {
    const orgId = 'e8347baa-b9ba-40a2-a319-3618d5e716e0'; // Blue Opus
    
    const { data: org } = await supabase
        .from('organizations')
        .select('lenco_subaccount_id, lenco_secret_key')
        .eq('id', orgId)
        .single();
        
    if (!org) {
        console.error('Org not found');
        return;
    }
    
    console.log(`[Lenco] Checking transactions for account: ${org.lenco_subaccount_id}`);
    const txs = await LencoService.getAccountTransactions(org.lenco_subaccount_id, {}, org.lenco_secret_key);
    
    // Search for 20.00
    const matches = txs.data.filter((t: any) => parseFloat(t.amount) === 20.00 && t.type === 'debit');
    
    console.log(`[Lenco] Found ${matches.length} matching transactions of K20:`);
    console.log(JSON.stringify(matches, null, 2));
}

checkLenco();

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import axios from 'axios';
import { supabase } from '../src/lib/supabase';
import { handleCollectionSuccessful } from '../src/controllers/lenco.webhook.controller';

const TRANSACTION_ID = '35334fbf-f2a4-4ff1-8711-69d9e322d024';
const ORGANIZATION_ID = 'e8347baa-b9ba-40a2-a319-3618d5e716e0';

async function run() {
    console.log('Fetching from Lenco API using axios...');
    
    // Check if already logged to prevent duplicates
    const { data: existing } = await supabase
        .from('cashbook_entries')
        .select('id, description, debit')
        .like('description', `%CHG-1773937903615-df2ff8c6-eebf-4e53-923e-986c970e6794-3e40720c%`)
        .maybeSingle();

    if (existing) {
        console.log(`✅ Already logged: ${existing.id} — K${existing.debit}`);
        process.exit(0);
    }
    
    const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('lenco_secret_key')
        .eq('id', ORGANIZATION_ID)
        .single();
        
    const secretKey = orgData?.lenco_secret_key;
    
    if (orgError) return console.error('Org query error', orgError);
    if (!secretKey) return console.error('No secret key found');
    
    try {
        const response = await axios.get(`https://api.lenco.co/access/v2/transactions/${TRANSACTION_ID}`, {
            headers: { 'Authorization': `Bearer ${secretKey}` }
        });
        
        const tx = response.data;
        const txData = tx.data || tx;
        console.log('API Response Amount:', txData.amount, 'Reference:', txData.reference, 'Status:', txData.status);

        if (txData && txData.status === 'successful') {
            const success = await handleCollectionSuccessful(
                { ...txData },
                ORGANIZATION_ID
            );
            console.log('Ledger logging success:', success);
        }
    } catch (e: any) {
        console.error('API Error:', e.response?.data || e.message);
    }
    process.exit(0);
}
run();

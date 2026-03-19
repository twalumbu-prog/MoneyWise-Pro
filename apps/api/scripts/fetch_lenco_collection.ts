import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import axios from 'axios';
import { supabase } from '../src/lib/supabase';
import { handleCollectionSuccessful } from '../src/controllers/lenco.webhook.controller';

const REFERENCE = 'CHG-1773937903615-df2ff8c6-eebf-4e53-923e-986c970e6794-3e40720c';
const ORGANIZATION_ID = 'e8347baa-b9ba-40a2-a319-3618d5e716e0';

async function run() {
    console.log('Fetching Collection from Lenco API using axios...');
    
    const { data: orgData } = await supabase
        .from('organizations')
        .select('lenco_secret_key')
        .eq('id', ORGANIZATION_ID)
        .single();
        
    const secretKey = orgData?.lenco_secret_key;
    if (!secretKey) return console.error('No secret key found');
    
    try {
        const response = await axios.get(`https://api.lenco.co/access/v2/collections?reference=${REFERENCE}`, {
            headers: { 'Authorization': `Bearer ${secretKey}` }
        });
        
        const colList = response.data?.data || [];
        if (colList.length === 0) {
            console.log('No collection found for reference');
            return process.exit(1);
        }
        
        const colData = colList[0];
        console.log('API Collection Data Amount:', colData.amount, 'Status:', colData.status);

        if (colData && colData.status === 'successful') {
            const success = await handleCollectionSuccessful(
                { ...colData },
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

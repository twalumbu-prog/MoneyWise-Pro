import dotenv from 'dotenv';
import path from 'path';
import { LencoService } from '../src/services/lenco.service';
import { supabase } from '../src/lib/supabase';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkLenco() {
    try {
        const reference = 'REQ-81115dd6-17220';
        console.log(`Checking Lenco status for reference: ${reference}`);

        // Get organization API key
        const orgId = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
        const { data: orgKeys } = await supabase.from('organizations').select('lenco_secret_key').eq('id', orgId).single();
        const secretKey = orgKeys?.lenco_secret_key || process.env.LENCO_SECRET_KEY;

        console.log('Using API key:', secretKey ? 'FOUND' : 'MISSING');

        const statusCheck = await LencoService.getTransferStatus(reference, secretKey!);
        console.log('Lenco Status Check Result:', JSON.stringify(statusCheck, null, 2));
    } catch (err) {
        console.error('Error checking Lenco status:', err);
    }
}

checkLenco();

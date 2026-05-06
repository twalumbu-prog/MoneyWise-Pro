import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyAccounts() {
    const orgId = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
    
    // We need a valid token to call QuickBooks API
    // Since I don't have the token easily, I'll check if I can find it in the integration record
    const { data: integration } = await supabase
        .from('integrations')
        .select('*')
        .eq('provider', 'QUICKBOOKS')
        .eq('organization_id', orgId)
        .single();
    
    if (!integration) {
        console.log('Integration not found');
        return;
    }

    console.log('Current Config:', JSON.stringify(integration.config, null, 2));
}

verifyAccounts();

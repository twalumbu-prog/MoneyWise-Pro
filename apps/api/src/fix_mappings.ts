import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixMappings() {
    const orgId = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
    
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

    const newConfig = {
        ...integration.config,
        mappings: {
            ...integration.config?.mappings,
            "MONEYWISE_WALLET": {
                "id": "1150040087",
                "name": "MoneyWise Wallet"
            },
            "WALLET": {
                "id": "1150040087",
                "name": "MoneyWise Wallet"
            },
            "AIRTEL": {
                "id": "66",
                "name": "Airtel Money - 6195"
            },
            "MTN": {
                "id": "1150040087", // Assuming MTN also goes to wallet if processed via MoneyWise, but usually MTN has its own. 
                                   // However, looking at the user's report, they want MoneyWise Wallet to be the source.
                "name": "MoneyWise Wallet"
            }
        }
    };

    const { error } = await supabase
        .from('integrations')
        .update({ config: newConfig })
        .eq('provider', 'QUICKBOOKS')
        .eq('organization_id', orgId);

    if (error) {
        console.error('Error updating mapping:', error);
    } else {
        console.log('Mappings updated successfully!');
    }
}

fixMappings();

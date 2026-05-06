import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectMappings() {
    const { data: integrations, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('provider', 'QUICKBOOKS');
    
    if (error) {
        console.error('Error fetching integrations:', error);
        return;
    }

    integrations.forEach(int => {
        console.log(`--- Org: ${int.organization_id} ---`);
        console.log('Mappings:', JSON.stringify(int.config?.mappings, null, 2));
    });
}

inspectMappings();

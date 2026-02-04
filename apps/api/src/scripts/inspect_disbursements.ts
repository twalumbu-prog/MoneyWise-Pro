
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspectDisbursements() {
    try {
        console.log('Inspecting disbursements table...');

        // Check for columns by trying to select them
        const { data, error } = await supabase
            .from('disbursements')
            .select('*')
            .limit(1);

        if (error) {
            console.error('Error fetching from disbursements:', error);
        } else {
            console.log('Successfully fetched sample data. Columns present:', Object.keys(data[0] || {}));
            console.log('Sample row:', data[0]);
        }

        // Check for a specific requisition ID if possible? 
        // No, let's just see if there's any data.

    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

inspectDisbursements();


import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspectCashbook() {
    try {
        console.log('Inspecting cashbook_entries table...');
        const { data, error } = await supabase
            .from('cashbook_entries')
            .select('*')
            .limit(1);

        if (error) {
            console.error('Error fetching from cashbook_entries:', error);
        } else {
            console.log('Successfully fetched sample data. Columns present:', Object.keys(data[0] || {}));
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

inspectCashbook();


import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkRecentWork() {
    try {
        console.log('Checking all ledger entries from today...');
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('cashbook_entries')
            .select('*')
            .gte('date', today)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error:', error);
        } else {
            console.log(`Found ${data?.length || 0} entries today:`);
            console.table(data.map(e => ({
                id: e.id.slice(0, 8),
                type: e.entry_type,
                req: e.requisition_id?.slice(0, 8),
                desc: e.description,
                credit: e.credit,
                status: e.status
            })));
        }
    } catch (err) {
        console.error(err);
    }
}

checkRecentWork();

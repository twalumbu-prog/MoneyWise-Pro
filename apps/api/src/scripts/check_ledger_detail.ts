
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkRecentLedger() {
    try {
        console.log('Checking recent cashbook entries...');
        const { data, error } = await supabase
            .from('cashbook_entries')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Error:', error);
        } else {
            console.table(data.map(e => ({
                id: e.id.slice(0, 8),
                type: e.entry_type,
                desc: e.description,
                credit: e.credit,
                debit: e.debit,
                balance: e.balance_after,
                status: e.status,
                created: e.created_at
            })));
        }
    } catch (err) {
        console.error(err);
    }
}

checkRecentLedger();

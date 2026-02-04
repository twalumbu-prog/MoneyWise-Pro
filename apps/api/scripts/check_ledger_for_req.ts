
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkLedgerForReq() {
    try {
        const id = '9d6e8506-913c-4b43-a67f-bb6b6035982c';
        console.log(`Checking ledger entries for Requisition: ${id}`);

        const { data, error } = await supabase
            .from('cashbook_entries')
            .select('*')
            .eq('requisition_id', id);

        if (error) {
            console.error('Error:', error);
        } else {
            console.log(`Found ${data?.length || 0} entries:`);
            console.table(data.map(e => ({
                id: e.id.slice(0, 8),
                type: e.entry_type,
                desc: e.description,
                credit: e.credit,
                debit: e.debit,
                balance: e.balance_after,
                status: e.status
            })));
        }
    } catch (err) {
        console.error(err);
    }
}

checkLedgerForReq();

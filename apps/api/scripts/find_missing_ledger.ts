
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findMissingLedgerEntries() {
    try {
        console.log('Finding RECEIVED/COMPLETED requisitions missing ledger entries...');
        const { data: reqs, error: reqError } = await supabase
            .from('requisitions')
            .select('id, status, description, actual_total, disbursements(id, total_prepared)')
            .in('status', ['RECEIVED', 'CHANGE_SUBMITTED', 'COMPLETED']);

        if (reqError) throw reqError;

        const results = [];
        for (const r of reqs) {
            const { data: entries, error: entryError } = await supabase
                .from('cashbook_entries')
                .select('id')
                .eq('requisition_id', r.id)
                .eq('entry_type', 'DISBURSEMENT');

            if (!entries || entries.length === 0) {
                results.push({
                    id: r.id.slice(0, 8),
                    status: r.status,
                    desc: r.description,
                    disbursed: (r.disbursements as any)?.[0]?.total_prepared || 'N/A'
                });
            }
        }

        console.log(`Found ${results.length} requisitions missing ledger entries:`);
        console.table(results);
    } catch (err) {
        console.error(err);
    }
}

findMissingLedgerEntries();

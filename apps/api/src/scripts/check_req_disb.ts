
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkRecentRequisitions() {
    try {
        console.log('Checking recent requisitions and their disbursements...');
        const { data, error } = await supabase
            .from('requisitions')
            .select('id, status, description, created_at, disbursements(id)')
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Error:', error);
        } else {
            console.table(data.map(r => ({
                id: r.id.slice(0, 8),
                status: r.status,
                description: r.description,
                has_disbursement: (r.disbursements as any)?.length > 0
            })));
        }
    } catch (err) {
        console.error(err);
    }
}

checkRecentRequisitions();

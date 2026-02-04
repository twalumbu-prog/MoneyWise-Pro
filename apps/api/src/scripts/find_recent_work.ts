
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findRecentWork() {
    try {
        console.log('Finding requisitions with status CHANGE_SUBMITTED or COMPLETED...');
        const { data, error } = await supabase
            .from('requisitions')
            .select('id, status, description, created_at, updated_at')
            .in('status', ['CHANGE_SUBMITTED', 'COMPLETED', 'RECEIVED'])
            .order('updated_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Error:', error);
        } else {
            console.table(data.map(r => ({
                id: r.id.slice(0, 8),
                status: r.status,
                desc: r.description,
                created: r.created_at,
                updated: r.updated_at
            })));
        }
    } catch (err) {
        console.error(err);
    }
}

findRecentWork();

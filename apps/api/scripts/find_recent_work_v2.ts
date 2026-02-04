
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
        console.log('Finding MOST RECENT updated requisitions...');
        const { data, error } = await supabase
            .from('requisitions')
            .select('id, status, description, created_at, updated_at')
            .order('updated_at', { ascending: false })
            .limit(5);

        if (error) {
            console.error('Error:', error);
        } else {
            data.forEach((r, i) => {
                console.log(`[${i}] ID: ${r.id}, Status: ${r.status}, Desc: ${r.description}, Updated: ${r.updated_at}`);
            });
        }
    } catch (err) {
        console.error(err);
    }
}

findRecentWork();

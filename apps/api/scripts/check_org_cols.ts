import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { supabase } from '../src/lib/supabase';

async function run() {
    const { data: cols, error } = await supabase.from('organizations').select('*').limit(1);
    
    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Available Columns in organizations:', Object.keys(cols?.[0] || {}));
}
run();

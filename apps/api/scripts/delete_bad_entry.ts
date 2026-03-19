import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { supabase } from '../src/lib/supabase';

async function run() {
    console.log('Deleting bad ledger entry...');
    const { error } = await supabase.from('cashbook_entries').delete().like('description', '%CHG-1773937903615-df2ff8c6-eebf-4e53-923e-986c970e6794-3e40720c%');
    if (error) {
        console.error('Error deleting:', error.message);
    } else {
        console.log('Done.');
    }
}
run();

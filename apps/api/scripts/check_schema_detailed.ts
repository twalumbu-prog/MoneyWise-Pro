
import { supabase } from '../lib/supabase';

const checkSchema = async () => {
    try {
        console.log('--- Requisitions ---');
        const { data: reqData, error: reqError } = await supabase.from('requisitions').select('*').limit(1);
        if (reqError) console.error(reqError);
        else console.log(Object.keys(reqData[0] || {}));

        console.log('\n--- Disbursements ---');
        const { data: disData, error: disError } = await supabase.from('disbursements').select('*').limit(1);
        if (disError) console.error(disError);
        else console.log(Object.keys(disData[0] || {}));

        console.log('\n--- Cashbook Entries ---');
        const { data: cbData, error: cbError } = await supabase.from('cashbook_entries').select('*').limit(1);
        if (cbError) console.error(cbError);
        else console.log(Object.keys(cbData[0] || {}));

    } catch (e) {
        console.error(e);
    }
};

checkSchema();

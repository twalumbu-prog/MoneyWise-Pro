
import { supabase } from '../lib/supabase';

const checkVoucherSchema = async () => {
    try {
        console.log('Checking vouchers columns...');
        const { data, error } = await supabase
            .from('vouchers')
            .select('*')
            .limit(1);

        if (error) {
            console.log('Error selecting columns:', error.message);
        } else {
            if (data && data.length > 0) {
                console.log(Object.keys(data[0]));
            } else {
                console.log('No rows found, cannot infer columns from data. Using blank insert to get error hints? No, let\'s assume standard.');
                // create a dummy voucher to see error?
            }
        }
    } catch (error: any) {
        console.error('Error:', error.message);
    }
};

checkVoucherSchema();

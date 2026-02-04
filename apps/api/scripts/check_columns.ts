
import { supabase } from '../lib/supabase';

const checkColumns = async () => {
    try {
        console.log('Checking line_items columns...');
        // Try to select the specific columns we care about
        const { data, error } = await supabase
            .from('line_items')
            .select('id, actual_amount, receipt_url')
            .limit(1);

        if (error) {
            console.log('Error selecting columns (likely missing):', error.message);
        } else {
            console.log('Columns exist! Data sample:', data);
        }

        console.log('Checking storage buckets...');
        const { data: buckets, error: bucketError } = await supabase
            .storage
            .listBuckets();

        if (bucketError) {
            console.error('Error listing buckets:', bucketError.message);
        } else {
            console.log('Buckets:', buckets);
        }

    } catch (e) {
        console.error('Unexpected error:', e);
    }
};

checkColumns();

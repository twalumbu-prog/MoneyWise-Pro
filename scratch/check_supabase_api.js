const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    try {
        console.log('Testing Supabase HTTP API connection to:', supabaseUrl);
        const { data, error } = await supabase.from('organizations').select('id, name').limit(1);
        if (error) {
            console.error('Supabase error:', error);
        } else {
            console.log('Success! Data returned:', data);
        }
    } catch (err) {
        console.error('Catch error:', err);
    }
}

check();

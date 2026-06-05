const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testRpc(name, params) {
    try {
        console.log(`Calling RPC '${name}'...`);
        const { data, error } = await supabase.rpc(name, params);
        if (error) {
            console.log(`[ERROR] '${name}':`, error.message || error);
        } else {
            console.log(`[SUCCESS] '${name}':`, data);
        }
    } catch (err) {
        console.log(`[EXCEPTION] '${name}':`, err.message || err);
    }
}

async function run() {
    await testRpc('execute_sql', { query: 'SELECT 1' });
    await testRpc('exec_sql', { query: 'SELECT 1' });
    await testRpc('run_sql', { query: 'SELECT 1' });
    await testRpc('execute_ddl', { sql: 'SELECT 1' });
}

run();

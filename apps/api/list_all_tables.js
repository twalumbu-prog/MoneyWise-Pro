const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function retry(fn, retries = 5, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      console.warn(`Attempt ${i + 1} failed:`, err.message || err);
      if (i === retries - 1) throw err;
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

async function main() {
  console.log('Querying table names...');
  const tables = await retry(async () => {
    // Query pg_catalog to find all user tables
    const { data, error } = await supabase.rpc('execute_sql', {
      query: "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';"
    });
    if (error) {
      // If execute_sql RPC doesn't exist, we can try to query standard tables or check error
      throw error;
    }
    return data;
  });

  console.log('Tables found:', tables);
}

main().catch(async (err) => {
  console.error('RPC execute_sql failed, trying standard fetch on known table structure...');
  // We can query schema info or list table list via direct postgres connection if we had it,
  // or we can execute a simple SQL command using another method if available.
  console.error(err);
});

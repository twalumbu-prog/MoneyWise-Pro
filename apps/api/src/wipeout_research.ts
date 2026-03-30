
import { supabase } from './lib/supabase';

async function run() {
  const tables = ['audit_logs', 'sync_logs', 'receipts'];
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        console.log(`Error for ${table}: ${error.message}`);
      } else if (data && data.length > 0) {
        console.log(`${table} columns: ${Object.keys(data[0]).join(', ')}`);
      } else {
        console.log(`${table} is empty or has no rows to check columns`);
      }
    } catch (e: any) {
      console.log(`Failed to query ${table}: ${e.message}`);
    }
  }
}

run();

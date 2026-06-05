const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'apps/api/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: req } = await supabase.from('requisitions').select('estimated_total, actual_total').eq('id', 'da71773c-4371-48b8-afcd-4c3306631eba').single();
  const { data: entries } = await supabase.from('cashbook_entries').select('*').eq('requisition_id', 'da71773c-4371-48b8-afcd-4c3306631eba');
  console.log('Requisition:', req);
  console.log('Cashbook Entries:', entries);
}
run();

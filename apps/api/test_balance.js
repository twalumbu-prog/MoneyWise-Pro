require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('cashbook_entries')
    .select('*')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(20);
    
  if (error) {
    console.error('Fetch error:', error);
    return;
  }
  
  for(let i = 0; i < data.length; i++) {
    console.log(`[${i+1}] ${data[i].date} | ${data[i].account_type} | ${data[i].entry_type} | deb: ${data[i].debit}, cred: ${data[i].credit} | bal: ${data[i].balance_after}`);
  }
}
run().catch(console.error);

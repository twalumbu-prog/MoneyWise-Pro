require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('entity_type', 'cashbook_entries')
    .order('timestamp', { ascending: false })
    .limit(5);
  
  if (error) {
    console.error('Fetch error:', error);
    return;
  }
  
  console.log('Audit logs:', JSON.stringify(data, null, 2));
}
run().catch(console.error);

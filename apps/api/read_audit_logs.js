const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('Querying audit logs...');
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('entity_type', 'cashbook_entries')
    .order('timestamp', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching audit logs:', error);
    return;
  }

  console.log(`Found ${logs.length} audit logs.`);
  for (const log of logs) {
    console.log(`Timestamp: ${log.timestamp} | Action: ${log.action} | ID: ${log.entity_id}`);
    console.log('Changes:', JSON.stringify(log.changes, null, 2));
    console.log('---');
  }
}

main().catch(console.error);

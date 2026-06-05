const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: entries, error } = await supabase
    .from('cashbook_entries')
    .select('*')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching:', error);
    return;
  }

  console.log(`Total entries fetched: ${entries.length}`);

  const grouped = {};
  for (const entry of entries) {
    const key = `${entry.account_type}_${entry.organization_id}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  }

  for (const [key, list] of Object.entries(grouped)) {
    console.log(`\n========================================`);
    console.log(`Account: ${key} (${list.length} entries)`);
    console.log(`========================================`);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      console.log(`[${i}] ID: ${e.id} | Date: ${e.date} | CreatedAt: ${e.created_at} | Type: ${e.entry_type} | Deb: ${e.debit} | Cred: ${e.credit} | BalAfter: ${e.balance_after} | Desc: ${e.description.slice(0, 50)}`);
    }
  }
}

main().catch(console.error);

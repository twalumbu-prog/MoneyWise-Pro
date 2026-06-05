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
  const entries = await retry(async () => {
    const { data, error } = await supabase
      .from('cashbook_entries')
      .select('*')
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  });

  const grouped = {};
  for (const entry of entries) {
    const key = `${entry.account_type}_${entry.organization_id}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  }

  console.log('Earliest entries per account:');
  for (const [key, list] of Object.entries(grouped)) {
    console.log(`\nAccount: ${key}`);
    for (let i = 0; i < Math.min(3, list.length); i++) {
      const e = list[i];
      console.log(`  [${i}] ID: ${e.id} | Date: ${e.date} | CreatedAt: ${e.created_at} | Type: ${e.entry_type} | Deb: ${e.debit} | Cred: ${e.credit} | BalAfter: ${e.balance_after} | Desc: ${e.description}`);
    }
  }
}

main().catch(console.error);

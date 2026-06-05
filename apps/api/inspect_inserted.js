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
  const ids = ['f6dca12e-564d-4453-accd-903f8c1cb872', 'fe30b2e1-9b1c-4e07-83fe-623b45a24953'];
  
  console.log('Fetching inserted entries...');
  const insertedResult = await retry(async () => {
    const { data, error } = await supabase
      .from('cashbook_entries')
      .select('*')
      .in('id', ids);
    if (error) throw error;
    return data;
  });

  console.log('Inserted entries details:');
  console.log(JSON.stringify(insertedResult, null, 2));

  if (insertedResult.length > 0) {
    const { account_type, organization_id } = insertedResult[0];
    console.log(`\nFetching recent entries for account: ${account_type} / ${organization_id}`);
    
    const recentResult = await retry(async () => {
      const { data, error } = await supabase
        .from('cashbook_entries')
        .select('*')
        .eq('account_type', account_type)
        .eq('organization_id', organization_id)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    });

    console.log(`Total entries in this account: ${recentResult.length}`);
    const last20 = recentResult.slice(-20);
    console.log('Last 20 entries for this account in chronological order:');
    for (let i = 0; i < last20.length; i++) {
      const e = last20[i];
      console.log(`[${recentResult.length - 20 + i}] ID: ${e.id} | Date: ${e.date} | CreatedAt: ${e.created_at} | Type: ${e.entry_type} | Deb: ${e.debit} | Cred: ${e.credit} | BalAfter: ${e.balance_after} | Desc: ${e.description}`);
    }
  }
}

main().catch(console.error);

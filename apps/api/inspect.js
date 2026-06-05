require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function retryQuery(fn, retries = 5, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fn();
      if (res && res.error) {
        const errMsg = String(res.error.message || '');
        if (errMsg.includes('fetch failed') || errMsg.includes('timeout') || errMsg.includes('ConnectTimeoutError')) {
          console.warn(`[Supabase Retry] Attempt ${i + 1} returned transient error: ${errMsg}`);
          if (i === retries - 1) return res;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      return res;
    } catch (err) {
      console.warn(`[Supabase Retry] Attempt ${i + 1} threw exception:`, err.message || err);
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}

async function run() {
  console.log('Fetching entries with retries...');
  const { data: allEntries, error } = await retryQuery(() => supabase
    .from('cashbook_entries')
    .select('*')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })
  );
    
  if (error) {
    console.error('Fetch error:', error);
    return;
  }
  
  console.log(`Total entries: ${allEntries.length}`);
  
  const byAccountType = {};
  for (const entry of allEntries) {
    const key = `${entry.account_type}_${entry.organization_id}`;
    if (!byAccountType[key]) byAccountType[key] = [];
    byAccountType[key].push(entry);
  }
  
  for (const [key, entries] of Object.entries(byAccountType)) {
    console.log(`\nAccount Type/Org: ${key} (${entries.length} entries)`);
    // print the first 3 entries and the last 3 entries
    console.log('  Earliest:');
    for (let i = 0; i < Math.min(3, entries.length); i++) {
      console.log(`    ${entries[i].date} [${entries[i].entry_type}] debit: ${entries[i].debit}, credit: ${entries[i].credit}, balance_after: ${entries[i].balance_after}`);
    }
    if (entries.length > 3) {
      console.log('  Latest:');
      const start = Math.max(3, entries.length - 3);
      for (let i = start; i < entries.length; i++) {
        console.log(`    ${entries[i].date} [${entries[i].entry_type}] debit: ${entries[i].debit}, credit: ${entries[i].credit}, balance_after: ${entries[i].balance_after} | Desc: ${entries[i].description}`);
      }
    }
  }
}
run().catch(console.error);

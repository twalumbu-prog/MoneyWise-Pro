const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: allEntries, error } = await supabase
    .from('cashbook_entries')
    .select('*')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Total entries: ${allEntries.length}`);

  let runningBalance = 0;
  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    const prevBalance = runningBalance;
    const debit = entry.debit || 0;
    const credit = entry.credit || 0;
    runningBalance += debit;
    runningBalance -= credit;
    runningBalance = Math.round(runningBalance * 100) / 100;

    // Check if the database's balance_after matches our computed runningBalance
    const isMatched = Math.abs(entry.balance_after - runningBalance) < 0.001;
    if (i < 30 || !isMatched) {
      console.log(`[${i}] Date: ${entry.date} | Account: ${entry.account_type} | Type: ${entry.entry_type} | Deb: ${entry.debit} | Cred: ${entry.credit} | DB_Bal: ${entry.balance_after} | Computed_Bal: ${runningBalance} | Matched: ${isMatched}`);
    }
  }
}

main().catch(console.error);

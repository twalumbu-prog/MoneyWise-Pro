require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const orgId = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
  const userId = '54de28ee-d913-408f-837f-0adfcda179d1';

  // The new entries
  const newEntries = [
    {
      date: '2026-05-20',
      description: 'Projects Twalumbu / 2614004874',
      debit: 15000,
      credit: 0,
      balance_after: 0, // will be updated
      created_at: '2026-05-20T14:20:00.000Z',
      entry_type: 'INFLOW',
      status: 'COMPLETED',
      account_type: 'MONEYWISE_WALLET',
      organization_id: orgId,
      created_by: userId,
      reference_number: '2614004875'
    },
    {
      date: '2026-05-22',
      description: 'Transfering money to moneywise for Mrs Acheta\'s loan / 2614203215',
      debit: 15000,
      credit: 0,
      balance_after: 0, // will be updated
      created_at: '2026-05-22T12:10:00.000Z',
      entry_type: 'INFLOW',
      status: 'COMPLETED',
      account_type: 'MONEYWISE_WALLET',
      organization_id: orgId,
      created_by: userId,
      reference_number: '2614203216'
    }
  ];

  console.log('Inserting new entries...');
  const { data: inserted, error: insertError } = await supabase
    .from('cashbook_entries')
    .insert(newEntries)
    .select();
  
  if (insertError) {
    console.error('Insert error:', insertError);
    return;
  }
  console.log('Inserted:', inserted.map(i => i.id));

  console.log('Fetching all entries to recalculate balances...');
  const { data: allEntries, error: fetchError } = await supabase
    .from('cashbook_entries')
    .select('id, debit, credit, balance_after, date, created_at')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });
    
  if (fetchError) {
    console.error('Fetch error:', fetchError);
    return;
  }
  
  let runningBalance = 0;
  const updates = [];

  for (const entry of allEntries) {
    const debit = entry.debit || 0;
    const credit = entry.credit || 0;
    runningBalance += debit;
    runningBalance -= credit;
    
    // Round to 2 decimal places to avoid floating point issues
    runningBalance = Math.round(runningBalance * 100) / 100;
    
    if (Math.abs(entry.balance_after - runningBalance) > 0.001) {
      updates.push({
        id: entry.id,
        balance_after: runningBalance
      });
    }
  }

  console.log(`Found ${updates.length} entries needing balance updates.`);

  // Update in batches or individually
  let count = 0;
  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('cashbook_entries')
      .update({ balance_after: update.balance_after })
      .eq('id', update.id);
      
    if (updateError) {
      console.error(`Update error for id ${update.id}:`, updateError);
    } else {
      count++;
    }
  }
  
  console.log(`Successfully updated ${count} entries.`);
}

run().catch(console.error);

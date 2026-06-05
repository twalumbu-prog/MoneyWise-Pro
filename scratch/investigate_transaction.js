const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/kim_life/Documents/MoneyWise-Pro/apps/api/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('Searching for Reference: 2615607840 or Name: Tukiya');

  // Search cashbook entries by description or reference
  const { data: entriesByRef, error: e1 } = await supabase
    .from('cashbook_entries')
    .select('*')
    .like('description', '%2615607840%');

  console.log('Entries by reference code:', entriesByRef, e1 || '');

  const { data: entriesByName, error: e2 } = await supabase
    .from('cashbook_entries')
    .select('*')
    .like('description', '%Tukiya%');

  console.log('Entries by customer name:', entriesByName, e2 || '');

  // Search product sales
  const { data: salesByRef, error: e3 } = await supabase
    .from('product_sales')
    .select('*')
    .eq('reference', '2615607840');

  console.log('Sales by reference code:', salesByRef, e3 || '');

  const { data: salesByName, error: e4 } = await supabase
    .from('product_sales')
    .select('*')
    .like('customer_name', '%Tukiya%');

  console.log('Sales by customer name:', salesByName, e4 || '');
  
  // Let's also check if there are other transactions on the date of 2026-06-05
  const { data: todayEntries, error: e5 } = await supabase
    .from('cashbook_entries')
    .select('*')
    .eq('entry_type', 'INFLOW')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Recent 10 inflows:', todayEntries.map(e => ({ id: e.id, description: e.description, status: e.status, amount: e.credit || e.debit })), e5 || '');
}

main().catch(console.error);

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const axios = require('axios');

async function main() {
  // Load org credentials
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('lenco_subaccount_id, lenco_secret_key')
    .eq('id', 'e359c84e-b42b-4b0a-b422-a2074d87d83a')
    .single();

  if (orgErr || !org?.lenco_subaccount_id || !org?.lenco_secret_key) {
    console.error('Cannot load credentials:', orgErr);
    return;
  }

  const subaccountId = org.lenco_subaccount_id;
  const secretKey = org.lenco_secret_key;
  
  console.log('Subaccount ID:', subaccountId);

  // Fetch all transactions
  let allTxns = [];
  let page = 1;
  while (true) {
    const url = `https://api.lenco.co/access/v2/transactions`;
    console.log(`Fetching Lenco page ${page}...`);
    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Accept': 'application/json'
        },
        params: {
          accountId: subaccountId,
          page: page
        }
      });
      // The transactions are inside response.data.data
      const txns = response.data?.data || [];
      if (!Array.isArray(txns) || txns.length === 0) break;
      allTxns = allTxns.concat(txns);
      if (txns.length < 100) break;
      page++;
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error('Error fetching page:', e.response?.data || e.message);
      break;
    }
  }

  console.log(`Total transactions fetched: ${allTxns.length}`);
  
  // Sort chronologically (oldest first)
  allTxns.sort((a, b) => new Date(a.datetime || 0).getTime() - new Date(b.datetime || 0).getTime());

  for (let i = 0; i < allTxns.length; i++) {
    const t = allTxns[i];
    console.log(`[${i}] Date: ${t.datetime} | Type: ${t.type} | Amt: ${t.amount} | Bal: ${t.balance} | Narration: ${t.remarks || t.narration || t.description || t.reference}`);
  }
}

main().catch(console.error);

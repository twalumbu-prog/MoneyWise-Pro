const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const axios = require('axios');

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
  console.log('Loading credentials...');
  const org = await retry(async () => {
    const { data, error } = await supabase
      .from('organizations')
      .select('lenco_subaccount_id, lenco_secret_key')
      .eq('id', 'e359c84e-b42b-4b0a-b422-a2074d87d83a')
      .single();
    if (error) throw error;
    return data;
  });

  const subaccountId = org.lenco_subaccount_id;
  const secretKey = org.lenco_secret_key;

  // 1. Fetch Lenco transactions
  console.log('Fetching Lenco transactions...');
  let lencoTxns = [];
  let page = 1;
  while (true) {
    try {
      const response = await axios.get('https://api.lenco.co/access/v2/transactions', {
        headers: { 'Authorization': `Bearer ${secretKey}`, 'Accept': 'application/json' },
        params: { accountId: subaccountId, page: page }
      });
      const txns = response.data?.data || [];
      if (!Array.isArray(txns) || txns.length === 0) break;
      lencoTxns = lencoTxns.concat(txns);
      if (txns.length < 100) break;
      page++;
    } catch (e) {
      console.error('Error fetching Lenco page:', e.message);
      break;
    }
  }

  console.log(`Fetched ${lencoTxns.length} Lenco transactions.`);

  // 2. Fetch disbursements from DB
  console.log('Fetching disbursements...');
  const disbs = await retry(async () => {
    const { data, error } = await supabase
      .from('disbursements')
      .select('requisition_id, total_prepared, payment_method, external_reference, requisitions!inner(organization_id, status, description)')
      .eq('requisitions.organization_id', 'e359c84e-b42b-4b0a-b422-a2074d87d83a');
    if (error) throw error;
    return data;
  });

  console.log(`Fetched ${disbs.length} disbursements from database.`);

  const lencoRefs = new Set();
  for (const t of lencoTxns) {
    const ref = (t.reference || t.clientReference || '').trim().toLowerCase();
    if (ref) lencoRefs.add(ref);
  }

  const unpairedDisbursements = [];
  for (const d of disbs) {
    // We only care about wallet disbursements (methods like BANK, MOBILE_MONEY, Wallet)
    // cash transactions don't hit Lenco.
    if (d.payment_method === 'CASH') continue;

    const ref = (d.external_reference || '').trim().toLowerCase();
    const hasMatch = lencoRefs.has(ref) || 
                     lencoTxns.some(t => {
                       const tRef = (t.reference || t.clientReference || '').trim().toLowerCase();
                       return tRef.includes(ref) || ref.includes(tRef);
                     });

    if (!hasMatch) {
      unpairedDisbursements.push(d);
    }
  }

  console.log(`\nUnpaired disbursements in database (no corresponding Lenco transaction):`);
  for (const d of unpairedDisbursements) {
    console.log(`Requisition ID: ${d.requisition_id} | Amount: K${d.total_prepared} | Method: ${d.payment_method} | Ref: ${d.external_reference} | Status: ${d.requisitions?.status} | Desc: ${d.requisitions?.description}`);
  }
}

main().catch(console.error);

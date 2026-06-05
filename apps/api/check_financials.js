const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const orgId = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
const startDate = '2026-02-01';
const endDate = '2026-06-30';

async function main() {
  console.log(`Calculating financials for Org ${orgId} for period ${startDate} to ${endDate}...`);

  // 1. Fetch accounts
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true);
    
  if (accErr) throw accErr;
  console.log(`Fetched ${accounts.length} accounts.`);

  // 2. Fetch cashbook entries up to endDate
  const { data: cbEntries, error: cbErr } = await supabase
    .from('cashbook_entries')
    .select('*')
    .eq('organization_id', orgId)
    .lte('date', endDate);
    
  if (cbErr) throw cbErr;
  console.log(`Fetched ${cbEntries.length} cashbook entries.`);

  // 3. Fetch wallets
  const { data: wallets, error: wErr } = await supabase
    .from('organization_wallets')
    .select('*')
    .eq('organization_id', orgId);
    
  if (wErr) throw wErr;
  console.log(`Fetched ${wallets.length} wallets.`);

  // 4. Fetch line items for allowed requisitions
  const allowedStatuses = ['DISBURSED', 'RECEIVED', 'EXPENSED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'COMPLETED', 'ACCOUNTED'];
  const { data: lineItems, error: liErr } = await supabase
    .from('line_items')
    .select(`
        *,
        requisition:requisitions!inner(
            id, 
            status, 
            created_at, 
            updated_at, 
            organization_id,
            cashbook_entries(id, date, entry_type)
        )
    `)
    .eq('requisition.organization_id', orgId)
    .in('requisition.status', allowedStatuses);
    
  if (liErr) throw liErr;
  console.log(`Fetched ${lineItems.length} line items.`);

  // Process Date Helper for line items
  const getLineItemDate = (item) => {
    const req = item.requisition;
    if (!req) return '';
    const cashbookEntries = req.cashbook_entries || [];
    const disbursement = cashbookEntries.find(c => c.entry_type === 'DISBURSEMENT');
    if (disbursement) return disbursement.date;
    if (cashbookEntries.length > 0) return cashbookEntries[0].date;
    return req.updated_at || req.created_at || '';
  };

  // Map to hold calculated balances
  const balances = {};
  for (const acc of accounts) {
    balances[acc.id] = {
      account_id: acc.id,
      account_name: acc.name,
      type: acc.type,
      code: acc.code,
      total_amount: 0,
      transaction_count: 0
    };
  }

  // Calculate balances
  for (const acc of accounts) {
    const balObj = balances[acc.id];
    
    if (acc.type === 'EXPENSE') {
      // Periodic
      // 1. Line items
      const matchingLIs = lineItems.filter(item => {
        const itemDate = getLineItemDate(item).split('T')[0];
        const matchAcc = item.account_id === acc.id || item.qb_account_id === acc.qb_account_id;
        return matchAcc && itemDate >= startDate && itemDate <= endDate;
      });
      
      const liSum = matchingLIs.reduce((sum, item) => sum + Number(item.actual_amount || item.estimated_amount || 0), 0);
      
      // 2. Cashbook entries (non-requisition disbursements/adjustments directly to this account)
      const matchingCBs = cbEntries.filter(entry => {
        const entryDate = entry.date;
        return entry.account_id === acc.id && !entry.requisition_id && entryDate >= startDate && entryDate <= endDate;
      });
      
      const cbSum = matchingCBs.reduce((sum, entry) => sum + (Number(entry.credit || 0) - Number(entry.debit || 0)), 0);
      
      balObj.total_amount = liSum + cbSum;
      balObj.transaction_count = matchingLIs.length + matchingCBs.length;
      
    } else if (acc.type === 'INCOME') {
      // Periodic
      const matchingCBs = cbEntries.filter(entry => {
        const entryDate = entry.date;
        return entry.account_id === acc.id && entryDate >= startDate && entryDate <= endDate;
      });
      
      balObj.total_amount = matchingCBs.reduce((sum, entry) => sum + (Number(entry.debit || 0) - Number(entry.credit || 0)), 0);
      balObj.transaction_count = matchingCBs.length;
      
    } else if (acc.type === 'ASSET') {
      // Cumulative
      // Check if it represents cash/wallet/bank
      const nameLower = acc.name.toLowerCase();
      const isBankWalletOrCash = acc.subtype === 'Bank' || nameLower.includes('wallet') || nameLower.includes('cash') || nameLower.includes('bank');
      
      if (isBankWalletOrCash) {
        if (nameLower.includes('main') || acc.code === 'QB-1150040000') {
          // Main Wallet
          const matchingCBs = cbEntries.filter(entry => entry.account_type === 'MONEYWISE_WALLET');
          balObj.total_amount = matchingCBs.reduce((sum, entry) => sum + (Number(entry.debit || 0) - Number(entry.credit || 0)), 0);
          balObj.transaction_count = matchingCBs.length;
        } else {
          // Check if matches a specific subwallet
          const matchedWallet = wallets.find(w => w.name === acc.name || w.qb_account_id === acc.qb_account_id);
          if (matchedWallet) {
            const matchingCBs = cbEntries.filter(entry => entry.wallet_id === matchedWallet.id);
            balObj.total_amount = matchingCBs.reduce((sum, entry) => sum + (Number(entry.debit || 0) - Number(entry.credit || 0)), 0);
            balObj.transaction_count = matchingCBs.length;
          } else if (nameLower.includes('cash')) {
            // Physical Cash
            const matchingCBs = cbEntries.filter(entry => entry.account_type === 'CASH');
            balObj.total_amount = matchingCBs.reduce((sum, entry) => sum + (Number(entry.debit || 0) - Number(entry.credit || 0)), 0);
            balObj.transaction_count = matchingCBs.length;
          } else {
            // General or other bank
            const matchingCBs = cbEntries.filter(entry => entry.account_id === acc.id);
            const cbSum = matchingCBs.reduce((sum, entry) => sum + (Number(entry.credit || 0) - Number(entry.debit || 0)), 0);
            const matchingLIs = lineItems.filter(item => item.account_id === acc.id || item.qb_account_id === acc.qb_account_id);
            const liSum = matchingLIs.reduce((sum, item) => sum + Number(item.actual_amount || item.estimated_amount || 0), 0);
            balObj.total_amount = cbSum + liSum;
            balObj.transaction_count = matchingCBs.length + matchingLIs.length;
          }
        }
      } else {
        // Other Asset
        const matchingCBs = cbEntries.filter(entry => entry.account_id === acc.id);
        const cbSum = matchingCBs.reduce((sum, entry) => sum + (Number(entry.credit || 0) - Number(entry.debit || 0)), 0);
        const matchingLIs = lineItems.filter(item => item.account_id === acc.id || item.qb_account_id === acc.qb_account_id);
        const liSum = matchingLIs.reduce((sum, item) => sum + Number(item.actual_amount || item.estimated_amount || 0), 0);
        balObj.total_amount = cbSum + liSum;
        balObj.transaction_count = matchingCBs.length + matchingLIs.length;
      }
      
    } else if (acc.type === 'LIABILITY' || acc.type === 'EQUITY') {
      // Cumulative
      const matchingCBs = cbEntries.filter(entry => entry.account_id === acc.id);
      const cbSum = matchingCBs.reduce((sum, entry) => sum + (Number(entry.debit || 0) - Number(entry.credit || 0)), 0);
      const matchingLIs = lineItems.filter(item => item.account_id === acc.id || item.qb_account_id === acc.qb_account_id);
      const liSum = matchingLIs.reduce((sum, item) => sum + Number(item.actual_amount || item.estimated_amount || 0), 0);
      
      balObj.total_amount = cbSum - liSum;
      balObj.transaction_count = matchingCBs.length + matchingLIs.length;
    }
  }

  // Print results
  const list = Object.values(balances);
  const revenue = list.filter(b => b.type === 'INCOME' && b.total_amount !== 0);
  const expenses = list.filter(b => b.type === 'EXPENSE' && b.total_amount !== 0);
  const assets = list.filter(b => b.type === 'ASSET' && b.total_amount !== 0);
  const liabilities = list.filter(b => b.type === 'LIABILITY' && b.total_amount !== 0);
  const equity = list.filter(b => b.type === 'EQUITY' && b.total_amount !== 0);

  console.log('\n--- Revenue Accounts ---');
  revenue.forEach(r => console.log(`  ${r.account_name}: K${r.total_amount.toLocaleString()}`));
  console.log('\n--- Expense Accounts ---');
  expenses.forEach(e => console.log(`  ${e.account_name}: K${e.total_amount.toLocaleString()}`));
  console.log('\n--- Asset Accounts ---');
  assets.forEach(a => console.log(`  ${a.account_name}: K${a.total_amount.toLocaleString()}`));
  console.log('\n--- Liability Accounts ---');
  liabilities.forEach(l => console.log(`  ${l.account_name}: K${l.total_amount.toLocaleString()}`));
  console.log('\n--- Equity Accounts ---');
  equity.forEach(eq => console.log(`  ${eq.account_name}: K${eq.total_amount.toLocaleString()}`));
}

main().catch(console.error);

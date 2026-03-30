import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { cashbookService } from '../src/services/cashbook.service';

// Load environment variables correctly from apps/api
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Searching for MONEYWISE_WALLET disbursements without a cashbook entry...');
  
  // 1. Find all MONEYWISE_WALLET disbursements
  const { data: disbursements, error: disbError } = await supabase
    .from('disbursements')
    .select('requisition_id')
    .eq('payment_method', 'MONEYWISE_WALLET');

  if (disbError) {
    console.error('Error fetching disbursements:', disbError);
    process.exit(1);
  }

  console.log(`Found ${disbursements.length} wallet disbursements.`);
  
  let fixedCount = 0;

  for (const row of disbursements) {
    const reqId = row.requisition_id;
    
    // Check if it's missing from cashbook_entries
    const { data: existingLedger } = await supabase
      .from('cashbook_entries')
      .select('id')
      .eq('requisition_id', reqId)
      .eq('status', 'DISBURSED')
      .maybeSingle();

    if (!existingLedger) {
      console.log(`\nFound missing ledger for Requisition ${reqId}. Finalizing now...`);
      await cashbookService.finalizeWalletDisbursementLedger(reqId);
      fixedCount++;
    }
  }

  console.log(`\nDone! Fixed ${fixedCount} missing ledger entries.`);
}

run().catch(console.error);

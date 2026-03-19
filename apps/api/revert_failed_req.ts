import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function revertRequisition(reqIdPart: string) {
  try {
    // 1. Find the requisition
    // Fetch recent requisitions and filter in JS
    const { data: requisitions, error: findError } = await supabase
      .from('requisitions')
      .select('id, status, reference_number, estimated_total')
      .order('created_at', { ascending: false })
      .limit(100);

    if (findError) throw findError;
    
    const req = requisitions?.find(r => r.id.startsWith(reqIdPart));
    if (!req) {
      console.log(`No requisition found in memory matching ${reqIdPart}. Requisition list size: ${requisitions?.length}`);
      // Log the IDs of the first few to see if we're in the right place
      console.log('Sample IDs:', requisitions?.slice(0, 5).map(r => r.id));
      return;
    }
    const id = req.id;
    console.log(`Found Requisition: ${id} (${req.reference_number}), Status: ${req.status}`);

    // 2. Revert status to AUTHORISED
    // Note: We also need to subtract the K8.5 fee from the estimated_total if it was added
    const originalEstimatedTotal = Number(req.estimated_total) - 8.5; // Assuming the fee was added
    
    console.log(`Reverting status to AUTHORISED and adjusting total...`);
    const { error: updateError } = await supabase
      .from('requisitions')
      .update({ 
        status: 'AUTHORISED', 
        estimated_total: originalEstimatedTotal,
        actual_total: null 
      })
      .eq('id', id);
    if (updateError) throw updateError;

    // 3. Delete Cashbook Entries
    console.log(`Deleting cashbook entries for requisition ${id}...`);
    const { error: ceError } = await supabase
      .from('cashbook_entries')
      .delete()
      .eq('requisition_id', id);
    if (ceError) throw ceError;

    // 4. Delete Disbursements
    console.log(`Deleting disbursement records for requisition ${id}...`);
    const { error: disbError } = await supabase
      .from('disbursements')
      .delete()
      .eq('requisition_id', id);
    if (disbError) throw disbError;

    // 5. Delete Withdrawal Fee Line Item
    console.log(`Deleting withdrawal fee line item for requisition ${id}...`);
    const { error: liError } = await supabase
      .from('line_items')
      .delete()
      .eq('requisition_id', id)
      .eq('description', 'Withdrawal Fee (MoneyWise Wallet)');
    if (liError) throw liError;

    console.log('Revert completed successfully!');
  } catch (err) {
    console.error('Revert failed:', err);
  }
}

// The user specified Requisition #41b45cf5
revertRequisition('41b45cf5');

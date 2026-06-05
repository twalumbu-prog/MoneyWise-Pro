const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const id = 'da71773c-4371-48b8-afcd-4c3306631eba';

async function run() {
  const { data: req } = await supabase.from('requisitions').select('*').eq('id', id).single();
  console.log('Requisition before:', req.estimated_total, req.actual_total);

  // 1. Update estimated_total
  await supabase.from('requisitions').update({ estimated_total: req.actual_total }).eq('id', id);

  // 2. Create voucher
  const baseVoucherRef = `PV-${req.reference_number || id.slice(0, 6)}`;
  let voucherRef = baseVoucherRef;
  const { data: newVoucher } = await supabase.from('vouchers').insert({
    requisition_id: id,
    organization_id: req.organization_id,
    created_by: req.requestor_id,
    reference_number: voucherRef,
    total_credit: req.actual_total,
    total_debit: req.actual_total,
    status: 'DRAFT'
  }).select().single();

  console.log('Created voucher:', newVoucher.reference_number);

  // 3. Finalize ledger
  const { data: originalEntry } = await supabase
    .from('cashbook_entries')
    .select('*')
    .eq('requisition_id', id)
    .eq('entry_type', 'DISBURSEMENT')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (originalEntry) {
    const discrepancy = 0;
    const newDescription = `Voucher ${newVoucher.reference_number} (Actual for Req #${id.slice(0, 8)})`;
    
    await supabase.from('cashbook_entries').update({
        credit: req.actual_total + discrepancy,
        description: newDescription,
        status: 'COMPLETED',
        voucher_id: newVoucher.id
    }).eq('id', originalEntry.id);
    
    // We would need to recalculate balances, but for a one-off fix we can just update the balance manually
    await supabase.rpc('recalculate_cashbook_balances', {
        p_org_id: req.organization_id,
        p_start_date: originalEntry.date,
        p_start_time: originalEntry.created_at,
        p_account_type: originalEntry.account_type
    });

    console.log('Updated cashbook entry:', originalEntry.id, 'New credit:', req.actual_total);
  } else {
    console.log('No original entry found');
  }
}
run().catch(console.error);

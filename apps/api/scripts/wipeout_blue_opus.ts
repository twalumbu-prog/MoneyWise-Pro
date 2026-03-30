
import { supabase } from '../src/lib/supabase';

const BLUE_OPUS_ORG_ID = 'e8347baa-b9ba-40a2-a319-3618d5e716e0';

async function wipeout() {
  console.log('--- Wiping Transactions for Blue Opus (e8347baa...) ---');

  // 1. Get all requisition IDs for the organization
  const { data: reqs, error: fetchError } = await supabase
    .from('requisitions')
    .select('id')
    .eq('organization_id', BLUE_OPUS_ORG_ID);

  if (fetchError) {
    console.error('Failed to fetch requisitions:', fetchError.message);
    return;
  }

  const reqIds = reqs.map(r => r.id);
  console.log(`Found ${reqIds.length} requisitions to wipe.`);

  if (reqIds.length === 0) {
    // Even if no requisitions, there might be dangling ledger entries or other data.
    // Let's also check cashbook directly by org_id.
  }

  try {
    // 2. Clear Cashbook Entries
    const { count: cbCount } = await supabase
      .from('cashbook_entries')
      .delete()
      .eq('organization_id', BLUE_OPUS_ORG_ID);
    console.log(`- Deleted ${cbCount || 0} cashbook entries.`);

    // 3. Clear Vouchers (Cascade handles lines)
    const { count: vCount } = await supabase
      .from('vouchers')
      .delete()
      .eq('organization_id', BLUE_OPUS_ORG_ID);
    console.log(`- Deleted ${vCount || 0} vouchers.`);

    // 4. Clear Disbursements
    const { count: dCount } = await supabase
      .from('disbursements')
      .delete()
      .eq('organization_id', BLUE_OPUS_ORG_ID);
    console.log(`- Deleted ${dCount || 0} disbursements.`);

    // 5. Clear Receipts
    const { count: rCount } = await supabase
      .from('receipts')
      .delete()
      .eq('organization_id', BLUE_OPUS_ORG_ID);
    console.log(`- Deleted ${rCount || 0} receipts.`);

    // 6. Clear Sync Logs (by requisition_id)
    if (reqIds.length > 0) {
      const { count: sCount } = await supabase
        .from('sync_logs')
        .delete()
        .in('requisition_id', reqIds);
      console.log(`- Deleted ${sCount || 0} sync logs.`);
    }

    // 7. Clear Audit Logs (for REQUISITION entities in this org)
    if (reqIds.length > 0) {
      const { count: aCount } = await supabase
        .from('audit_logs')
        .delete()
        .eq('entity_type', 'REQUISITION')
        .in('entity_id', reqIds);
      console.log(`- Deleted ${aCount || 0} requisition audit logs.`);
    }

    // 8. Clear Requisitions (Cascade handles line items)
    const { count: finalReqCount } = await supabase
      .from('requisitions')
      .delete()
      .eq('organization_id', BLUE_OPUS_ORG_ID);
    console.log(`- Deleted ${finalReqCount || 0} requisitions.`);

    console.log('--- Wipeout Complete! ---');
  } catch (err: any) {
    console.error('CRITICAL WIPE ERR:', err.message);
  }
}

wipeout();

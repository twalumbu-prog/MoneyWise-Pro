import { supabase } from '../lib/supabase';

const REAL_ORG_ID = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';

async function diagnose2() {
    // 1. Show ALL cashbook entries for the correct org, sorted by date
    const { data: allEntries } = await supabase
        .from('cashbook_entries')
        .select('id, date, created_at, entry_type, status, credit, debit, balance_after, description, requisition_id, account_type')
        .eq('organization_id', REAL_ORG_ID)
        .eq('account_type', 'MONEYWISE_WALLET')
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

    console.log(`\n=== MONEYWISE_WALLET ENTRIES FOR ORG (${allEntries?.length} total) ===`);
    for (const e of allEntries || []) {
        const amt = Number(e.debit) > 0 ? `+K${Number(e.debit).toFixed(2)}` : `-K${Number(e.credit).toFixed(2)}`;
        console.log(`${e.date} | ${(e.entry_type||'').padEnd(14)} | ${(e.status||'').padEnd(10)} | ${amt.padStart(14)} | bal: K${Number(e.balance_after).toFixed(2)} | req: ${e.requisition_id?.slice(0,8)||'---'}`);
    }

    // 2. All disbursements for this org (via requisitions join)
    const { data: disbs } = await supabase
        .from('disbursements')
        .select('requisition_id, issued_at, total_prepared, payment_method, external_reference, requisitions!inner(organization_id, status, updated_at)')
        .eq('requisitions.organization_id', REAL_ORG_ID)
        .not('external_reference', 'is', null)
        .order('issued_at', { ascending: true });

    console.log(`\n=== DISBURSEMENTS FOR ORG VIA REQUISITIONS JOIN (${disbs?.length} total) ===`);
    for (const d of disbs || []) {
        const hasEntry = allEntries?.some(e => e.requisition_id === d.requisition_id);
        console.log(`${d.issued_at?.split('T')[0]||'NO DATE'} | req: ${d.requisition_id?.slice(0,8)} | K${Number(d.total_prepared).toFixed(2)} | ${hasEntry ? '✅ IN LEDGER' : '⚠️  MISSING'} | ${d.payment_method}`);
    }

    // 3. Summary
    const loggedCount = disbs?.filter(d => allEntries?.some(e => e.requisition_id === d.requisition_id)).length || 0;
    const missingCount = (disbs?.length || 0) - loggedCount;
    const totalInflows = allEntries?.filter(e => e.entry_type === 'INFLOW').reduce((s, e) => s + Number(e.debit||0), 0) || 0;
    const totalOutflows = allEntries?.filter(e => e.entry_type === 'DISBURSEMENT').reduce((s, e) => s + Number(e.credit||0), 0) || 0;
    const finalBalance = allEntries && allEntries.length > 0 ? Number(allEntries[allEntries.length-1].balance_after) : 0;

    console.log('\n=== SUMMARY ===');
    console.log(`Total Inflows:  K${totalInflows.toFixed(2)}`);
    console.log(`Total Outflows: K${totalOutflows.toFixed(2)}`);
    console.log(`Final Balance:  K${finalBalance.toFixed(2)}`);
    console.log(`Logged disbursements:  ${loggedCount} / ${disbs?.length}`);
    console.log(`Missing from ledger:   ${missingCount}`);
}

diagnose2().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

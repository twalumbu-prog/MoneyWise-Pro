import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });


const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function recalculateBalances(organizationId: string, targetDate: string, targetCreatedAt: string, accountType: string) {
    console.log(`[Ledger] Recalculating balances for ${accountType} from ${targetDate} ${targetCreatedAt}...`);
    
    // 1. Get the entry just before the target point to find the starting balance
    const { data: prevEntry } = await supabase
        .from('cashbook_entries')
        .select('balance_after')
        .eq('organization_id', organizationId)
        .eq('account_type', accountType)
        .or(`date.lt.${targetDate},and(date.eq.${targetDate},created_at.lt.${targetCreatedAt})`)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    let runningBalance = prevEntry ? parseFloat(prevEntry.balance_after || '0') : 0;
    console.log(`[Ledger] Previous balance for ${accountType}: ${runningBalance}`);

    // 2. Fetch all entries from the target point forward
    const { data: entries, error } = await supabase
        .from('cashbook_entries')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('account_type', accountType)
        .or(`date.gt.${targetDate},and(date.eq.${targetDate},created_at.gte.${targetCreatedAt})`)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

    if (error || !entries) {
        console.error(`[Ledger] Error fetching entries:`, error);
        return;
    }

    console.log(`[Ledger] Updating ${entries.length} entries for ${accountType}...`);

    for (const entry of entries) {
        const debit = parseFloat(entry.debit || '0');
        const credit = parseFloat(entry.credit || '0');
        const newBalance = runningBalance + debit - credit;
        
        await supabase
            .from('cashbook_entries')
            .update({ balance_after: newBalance })
            .eq('id', entry.id);
            
        runningBalance = newBalance;
    }
    console.log(`[Ledger] Finished ${accountType}. Final balance: ${runningBalance}`);
}

async function fixRequisition() {
    const reqId = '41b45cf5-8d60-4773-9653-23adc275c6f6';
    const reqIdPrefix = '41b45cf5';
    
    // 1. Find the requisition and its current cashbook entry details
    const { data: entry, error: entryError } = await (supabase as any)
        .from('cashbook_entries')
        .select('*, requisitions!inner(id, organization_id)')
        .eq('requisition_id', reqId)
        .single();

        
    if (entryError || !entry) {
        console.error('Entry/Requisition not found:', entryError?.message);
        return;
    }
    
    const orgId = entry.organization_id;
    const date = entry.date;
    const createdAt = entry.created_at;

    console.log(`[Fix] Found Entry: ${entry.id} for Org: ${orgId}`);

    // 2. Update Disbursement record
    await supabase.from('disbursements').update({ payment_method: 'MONEYWISE_WALLET' }).eq('requisition_id', entry.requisition_id);
    
    // 3. Update the entry itself
    await supabase.from('cashbook_entries').update({ 
        account_type: 'MONEYWISE_WALLET',
        description: `MONEYWISE_WALLET disbursed for Requisition #${reqIdPrefix}`
    }).eq('id', entry.id);

    // 4. Recalculate BOTH ledgers
    await recalculateBalances(orgId, date, createdAt, 'CASH');
    await recalculateBalances(orgId, date, createdAt, 'MONEYWISE_WALLET');
    
    console.log('[Fix] Successfully migrated transaction from CASH to MONEYWISE_WALLET and updated balances.');
}

fixRequisition();

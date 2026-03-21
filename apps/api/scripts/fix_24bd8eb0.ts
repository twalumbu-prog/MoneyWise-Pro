import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function recalculateBalances(organizationId: string, targetDate: string, targetCreatedAt: string, accountType: string) {
    console.log(`[Ledger] Recalculating balances for ${accountType} from ${targetDate} ${targetCreatedAt}...`);
    
    // 1. Get the entry just before the target point
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
    const reqId = '24bd8eb0-f8fa-4a77-bf6d-35c49c2c0c50';
    const orgId = 'e8347baa-b9ba-40a2-a319-3618d5e716e0';
    const cashierId = '005693db-5e94-4e96-8e7d-14620f82ebaa';
    const amount = 20.00;
    const lencoId = 'db83d721-64b5-4ee5-9a4c-1d59ac349559';
    const lencoRef = '2608003521';
    
    console.log(`[Fix] Starting repair for requisition ${reqId}...`);
    
    // 1. Create/Update Disbursement Record
    const { data: existingDisb } = await supabase
        .from('disbursements')
        .select('id')
        .eq('requisition_id', reqId)
        .maybeSingle();

    let disbId = existingDisb?.id;
    if (disbId) {
        await supabase
            .from('disbursements')
            .update({
                cashier_id: cashierId,
                total_prepared: amount,
                payment_method: 'MONEYWISE_WALLET',
                organization_id: orgId,
                external_reference: lencoRef,
                issued_at: '2026-03-21T07:39:29.572Z'
            })
            .eq('id', disbId);
        console.log(`[Fix] Updated existing disbursement record: ${disbId}`);
    } else {
        const { data: newDisb, error: disbError } = await supabase
            .from('disbursements')
            .insert({
                requisition_id: reqId,
                cashier_id: cashierId,
                total_prepared: amount,
                payment_method: 'MONEYWISE_WALLET',
                organization_id: orgId,
                external_reference: lencoRef,
                issued_at: '2026-03-21T07:39:29.572Z'
            })
            .select()
            .single();
        if (disbError) {
            console.error('Error creating disbursement:', disbError.message);
            return;
        }
        disbId = newDisb.id;
        console.log(`[Fix] Created new disbursement record: ${disbId}`);
    }


    // 2. Create Cashbook entry

    // Get prev balance to satisfy constraint
    const { data: prevEntry } = await supabase
        .from('cashbook_entries')
        .select('balance_after')
        .eq('organization_id', orgId)
        .eq('account_type', 'MONEYWISE_WALLET')
        .or(`date.lt.2026-03-21,and(date.eq.2026-03-21,created_at.lt.2026-03-21T07:39:30.572Z)`)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
        
    const startingBalance = prevEntry ? parseFloat(prevEntry.balance_after || '0') : 0;

    const { data: entry, error: entryError } = await supabase
        .from('cashbook_entries')
        .insert({
            organization_id: orgId,
            requisition_id: reqId,
            account_type: 'MONEYWISE_WALLET',
            description: `MONEYWISE_WALLET disbursed for Requisition #24bd8eb0`,
            credit: amount,
            debit: 0,
            date: '2026-03-21',
            created_at: '2026-03-21T07:39:30.572Z',
            balance_after: startingBalance - amount
        })
        .select()
        .single();

        
    if (entryError) {
        console.error('Error creating cashbook entry:', entryError.message);
        return;
    }
    console.log(`[Fix] Created cashbook entry: ${entry.id}`);
    
    // 3. Recalculate ledger
    await recalculateBalances(orgId, '2026-03-21', entry.created_at, 'MONEYWISE_WALLET');
    
    console.log('[Fix] Successfully repaired requisition 24bd8eb0.');
}

fixRequisition();

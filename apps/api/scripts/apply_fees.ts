import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function recalculateBalances(organizationId: string, accountType: string) {
    console.log(`[Ledger] Recalculating all balances for ${accountType}...`);
    
    const { data: entries, error } = await supabase
        .from('cashbook_entries')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('account_type', accountType)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

    if (error || !entries) {
        console.error(`[Ledger] Error:`, error);
        return;
    }

    let runningBalance = 0;
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
    console.log(`[Ledger] Final balance for ${accountType}: ${runningBalance}`);
}

async function applyFees() {
    const reqIds = [
        '41b45cf5-8d60-4773-9653-23adc275c6f6',
        '24bd8eb0-f8fa-4a77-bf6d-35c49c2c0c50'
    ];
    const fee = 8.5;
    
    for (const reqId of reqIds) {
        console.log(`[Fee] Applying K8.5 fee to requisition ${reqId}...`);
        
        // 1. Update Disbursement
        const { data: disb } = await supabase
            .from('disbursements')
            .select('total_prepared')
            .eq('requisition_id', reqId)
            .single();
            
        if (disb) {
            const newTotal = parseFloat(disb.total_prepared || '0') + fee;
            await supabase
                .from('disbursements')
                .update({ total_prepared: newTotal })
                .eq('requisition_id', reqId);
            console.log(`[Fee] Updated disbursement total to ${newTotal}`);
        }
        
        // 2. Update Cashbook Entry
        const { data: entry } = await supabase
            .from('cashbook_entries')
            .select('id, credit, organization_id')
            .eq('requisition_id', reqId)
            .eq('account_type', 'MONEYWISE_WALLET')
            .single();
            
        if (entry) {
            const newCredit = parseFloat(entry.credit || '0') + fee;
            await supabase
                .from('cashbook_entries')
                .update({ credit: newCredit })
                .eq('id', entry.id);
            console.log(`[Fee] Updated cashbook credit to ${newCredit}`);
            
            // Recalculate
            await recalculateBalances(entry.organization_id, 'MONEYWISE_WALLET');
        }
    }
}

applyFees();

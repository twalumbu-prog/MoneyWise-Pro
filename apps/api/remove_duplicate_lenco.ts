import { cashbookService } from './src/services/cashbook.service';
import { supabase } from './src/lib/supabase';

async function fix() {
    const orgId = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
    const entryIdToRemove = '2ace414b-470f-469f-98f0-977463f53790'; // Moses Chibale
    
    console.log(`Removing entry: ${entryIdToRemove}`);
    
    // 1. Get entry details for recalculation reference
    const { data: entry } = await supabase
        .from('cashbook_entries')
        .select('*')
        .eq('id', entryIdToRemove)
        .single();
    
    if (!entry) {
        console.error('Entry not found');
        return;
    }

    // 2. Delete the entry
    const { error } = await supabase
        .from('cashbook_entries')
        .delete()
        .eq('id', entryIdToRemove);
    
    if (error) {
        console.error('Failed to delete entry:', error);
        return;
    }

    console.log('Successfully deleted. Recalculating balances...');

    // 3. Recalculate
    await cashbookService.recalculateBalancesFrom(
        orgId, 
        entry.date, 
        entry.created_at, 
        entry.account_type || 'MONEYWISE_WALLET'
    );
}

fix().then(() => console.log('Done')).catch(console.error);

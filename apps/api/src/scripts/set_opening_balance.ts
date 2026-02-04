import { supabase } from '../lib/supabase';

async function setOpeningBalance(amount: number = 5000) {
    console.log(`Setting opening balance to K${amount}...`);

    // First, check if any entries exist
    const { data: existing } = await supabase
        .from('cashbook_entries')
        .select('id')
        .limit(1);

    if (existing && existing.length > 0) {
        console.log('Cashbook already has entries. Opening balance will be added as a new starting point entry.');
    }

    const { data, error } = await supabase
        .from('cashbook_entries')
        .insert({
            date: new Date().toISOString().split('T')[0],
            description: 'Opening Balance (Initial Setup)',
            debit: amount,
            credit: 0,
            balance_after: amount,
            entry_type: 'OPENING_BALANCE'
        })
        .select();

    if (error) {
        console.error('Error setting opening balance:', error);
        return;
    }

    console.log('Successfully set opening balance:', data);
}

// Default to 5000 if no argument provided
const amount = process.argv[2] ? parseFloat(process.argv[2]) : 5000;
setOpeningBalance(amount);

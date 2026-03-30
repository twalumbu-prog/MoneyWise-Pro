import { cashbookService } from './src/services/cashbook.service';
import { supabase } from './src/lib/supabase';

async function fix() {
    const orgId = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
    const adminId = '54de28ee-d913-408f-837f-0adfcda179d1';
    
    const deposits = [
        { 
            ref: '2608607282', 
            name: 'Lillian Mubiana', 
            desc: 'LILLIAN MUBIANA MP260327.1351.L68991',
            amount: 9900 
        },
        { 
            ref: '2608608022', 
            name: 'Moses Chibale', 
            desc: 'Moses Chibale MP260327.1437.A76172',
            amount: 9900 
        }
    ];

    for (const d of deposits) {
        console.log(`Processing deposit: ${d.ref} (${d.name})`);
        
        // Final description matching our standard
        const narration = `A deposit of K${d.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} has been successfully deposited to the MoneyWise Wallet. Reference: ${d.ref} (${d.name})`;
        
        try {
            const entry = await cashbookService.createEntry(orgId, {
                date: '2026-03-27',
                description: narration,
                debit: d.amount,
                credit: 0,
                entry_type: 'INFLOW',
                account_type: 'MONEYWISE_WALLET',
                status: 'COMPLETED',
                created_by: adminId
            });
            console.log(`Successfully created entry: ${entry.id}`);
        } catch (err) {
            console.error(`Failed to create entry for ${d.ref}:`, err);
        }
    }
}

fix().then(() => console.log('Done')).catch(console.error);

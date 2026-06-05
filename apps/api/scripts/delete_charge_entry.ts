import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabase } from '../src/lib/supabase';
import { cashbookService } from '../src/services/cashbook.service';

const ENTRY_ID = '842b20b7-b7d8-4114-940c-fba7d3b2a144';
const ORGANIZATION_ID = 'e359c84e-b42b-4b0a-b422-a2074d87d83a';
const DATE = '2026-05-28';
const CREATED_AT = '2026-05-28 10:33:34.626023+00';
const ACCOUNT_TYPE = 'MONEYWISE_WALLET';

async function run() {
    console.log(`Deleting cashbook entry ${ENTRY_ID}...`);
    
    const { error: deleteError } = await supabase
        .from('cashbook_entries')
        .delete()
        .eq('id', ENTRY_ID);

    if (deleteError) {
        console.error('❌ Failed to delete entry:', deleteError);
        process.exit(1);
    }
    
    console.log('✅ Entry deleted successfully. Recalculating balances...');
    
    await cashbookService.recalculateBalancesFrom(ORGANIZATION_ID, DATE, CREATED_AT, ACCOUNT_TYPE);
    
    console.log('✅ Balances recalculated successfully!');
    process.exit(0);
}

run().catch(err => {
    console.error('Script error:', err);
    process.exit(1);
});

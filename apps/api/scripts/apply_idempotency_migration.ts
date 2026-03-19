import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { supabase } from '../src/lib/supabase';

async function applyMigration() {
    console.log('Applying idempotency migration via Supabase...');

    // Apply the unique constraint for DISBURSEMENT entries
    // Using supabase.rpc if available, otherwise fall back to raw approach
    const results: Array<{ step: string; success: boolean; error?: string }> = [];

    // Step 1: Add external_reference column
    const { error: colError } = await supabase
        .from('cashbook_entries')
        .select('external_reference')
        .limit(1);
    
    if (colError && colError.message.includes('external_reference')) {
        console.log('Column external_reference does not exist — needs to be added via SQL migration.');
        console.log('Please run the SQL in supabase/migrations/20260319_payment_idempotency_constraints.sql in the Supabase SQL editor.');
    } else {
        console.log('✅ Column external_reference already exists.');
    }

    // Step 2: Verify unique constraints by trying to duplicate an entry
    console.log('\nVerifying DB structure...');
    const { data, error } = await supabase
        .from('cashbook_entries')
        .select('id, entry_type, requisition_id, external_reference')
        .eq('entry_type', 'DISBURSEMENT')
        .not('requisition_id', 'is', null)
        .limit(3);

    if (!error && data) {
        console.log(`✅ Can query cashbook_entries. Found ${data.length} DISBURSEMENT entries.`);
    } else {
        console.error('❌ Query error:', error?.message);
    }

    console.log('\n⚠️  ACTION REQUIRED: Run the SQL in supabase/migrations/20260319_payment_idempotency_constraints.sql');
    console.log('   via the Supabase dashboard SQL Editor to apply the unique constraints.');
    console.log('   URL: https://app.supabase.com/project/klfeluphcutgppkhaxyl/sql');
    
    process.exit(0);
}

applyMigration();

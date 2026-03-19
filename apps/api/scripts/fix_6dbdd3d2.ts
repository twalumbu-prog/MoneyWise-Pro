import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables before doing anything else
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabase } from '../src/lib/supabase';
import { cashbookService } from '../src/services/cashbook.service';

const fixLedgers = async () => {
    // Find matching requisition by short ID
    // 6dbdd3d2-814 -> 6dbdd3d2
    const shortId = '6dbdd3d2';
    
    // In CashierDashboard, we see #6dbdd3d2-814. The ID is actually a UUID.
    // The External reference from Lenco is usually REQ-6dbdd3d2-...
    const { data: disbursements, error } = await supabase
        .from('disbursements')
        .select('id, requisition_id');

    if (error || !disbursements) {
        console.error('Failed to fetch disbursements', error);
        return;
    }

    const ids = disbursements
        .filter(d => d.id.startsWith(shortId))
        .map(d => d.requisition_id);
    console.log(`Found ${ids.length} requisitions to fix from disbursements.`);

    console.log('Starting retrospective ledger fix...');

    for (const id of ids) {
        try {
            console.log(`Processing requisition ${id}...`);
            await cashbookService.finalizeWalletDisbursementLedger(id);
            console.log(`Successfully finalized ledger for ${id}\n`);
        } catch (error) {
            console.error(`Failed to process ${id}:`, error);
        }
    }

    console.log('Finished.');
    process.exit(0);
};

fixLedgers();

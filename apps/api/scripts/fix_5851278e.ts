import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables before doing anything else
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { supabase } from '../src/lib/supabase';
import { cashbookService } from '../src/services/cashbook.service';

const fixLedgers = async () => {
    // #5851278e-952 is the first 12 characters of the disbursement id
    const shortId = '5851278e';
    
    const { data: disbursements, error } = await supabase
        .from('disbursements')
        .select('id, requisition_id, payment_method, external_reference');

    if (error || !disbursements) {
        console.error('Failed to fetch disbursements', error);
        return;
    }

    const matched = disbursements.filter(d => d.id.startsWith(shortId));
    console.log(`Found ${matched.length} disbursement(s) for #${shortId}:`, matched);
    
    const ids = matched.map(d => d.requisition_id);

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

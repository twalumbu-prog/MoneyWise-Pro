import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables (same bootstrap as other scripts)
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import { supabase } from '../lib/supabase';
import { triggerAIReview } from '../controllers/requisition.controller';

/**
 * One-off repair for requisitions that were stranded at the expense stage with a
 * "No change to submit" summary but no AI_REVIEW card (the post-response
 * triggerAIReview bug). Re-runs categorization for each so they advance.
 */
const STUCK_IDS = [
    '6d28f98f-abeb-4fc1-825f-30eb4cb8ed49', // REQ-2026-0241 Tyre Mending
    '2627eec6-fa17-4a50-89d0-55b2268ccc08', // REQ-2026-0009 Trip to Mazabuka Tollgate Fees
    '710d5f1c-637e-4154-b912-9c7a109e2593', // REQ-2026-0014 Withdraw of Event Funds for Amatoasts
    'fc6b2a3d-1891-4c2e-a89d-b4fa527f3cf8', // REQ-2026-0167 School uniforms
    'ca8b2fba-f985-405f-9b65-cce54eab8e23', // REQ-2026-0123 Pacra Annual return
];

async function run() {
    console.log('='.repeat(60));
    console.log(`Repairing ${STUCK_IDS.length} stuck (no-change) requisition(s)`);
    console.log('='.repeat(60));

    for (const id of STUCK_IDS) {
        const { data: req, error } = await supabase
            .from('requisitions')
            .select('id, reference_number, status, organization_id, requestor_id')
            .eq('id', id)
            .single();

        if (error || !req) {
            console.error(`❌ ${id}: not found (${error?.message})`);
            continue;
        }

        console.log(`\n→ ${req.reference_number} (${req.status}) — triggering AI categorization...`);
        try {
            await triggerAIReview(req.id, req.organization_id, req.requestor_id);
            const { data: after } = await supabase
                .from('requisitions')
                .select('status')
                .eq('id', id)
                .single();
            console.log(`✅ ${req.reference_number}: now ${after?.status}`);
        } catch (err: any) {
            console.error(`❌ ${req.reference_number}: triggerAIReview failed:`, err?.message || err);
        }
    }

    console.log('\nDone.');
    process.exit(0);
}

run().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});

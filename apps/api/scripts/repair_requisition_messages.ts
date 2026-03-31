import { supabase } from '../src/lib/supabase';

async function repairRequisitionMessages() {
    console.log('--- [Requisition Message Repair] Starting ---');

    // 1. Fetch all requisitions
    const { data: requisitions, error: reqError } = await supabase
        .from('requisitions')
        .select('id, requestor_id, status, description');

    if (reqError) {
        console.error('Error fetching requisitions:', reqError);
        return;
    }

    console.log(`Analyzing ${requisitions.length} requisitions...`);

    let repairCount = 0;
    
    for (const req of (requisitions as any[])) {
        // 2. Check if this requisition has any messages
        const { count, error: msgError } = await supabase
            .from('requisition_messages')
            .select('*', { count: 'exact', head: true })
            .eq('requisition_id', req.id);

        if (msgError) {
            console.error(`Error checking messages for ${req.id}:`, msgError);
            continue;
        }

        if (count === 0) {
            console.log(`[REPAIR] No messages found for ${req.id} (Status: ${req.status}). Generating initial message...`);
            
            // 3. Determine the correct stage/content based on current status
            let stage = 'APPROVAL';
            let content = 'Requisition submitted for approval';

            if (['AUTHORISED', 'DISBURSED', 'EXPENSED', 'CANCELLED'].includes(req.status)) {
                stage = 'DISBURSAL';
                content = 'Status updated to AUTHORISED';
            } else if (req.status === 'REJECTED') {
                stage = 'APPROVAL';
                content = 'Requisition submitted for approval';
            }

            // 4. Create the initial system message
            const { error: insertError } = await supabase
                .from('requisition_messages')
                .insert({
                    requisition_id: req.id,
                    user_id: req.requestor_id,
                    message_type: 'SYSTEM',
                    content,
                    metadata: { stage }
                });

            if (insertError) {
                console.error(`[FAIL] Failed to create message for ${req.id}:`, insertError.message);
            } else {
                repairCount++;
                // Also ensure has_unread_updates is false after repair so it doesn't look like a "new" notification to everyone
                await supabase
                    .from('requisitions')
                    .update({ has_unread_updates: false })
                    .eq('id', req.id);
            }
        }
    }

    console.log('--- [Repair Complete] ---');
    console.log(`Total requisitions repaired: ${repairCount}`);
}

repairRequisitionMessages().catch(err => console.error('Unhandled error during repair:', err));

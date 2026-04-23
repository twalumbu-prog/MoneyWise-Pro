
import { supabase } from '../src/lib/supabase';

async function checkEmptyChats() {
    console.log('--- [Checking Requisitions with No Messages] ---');

    // 1. Get all requisitions
    const { data: requisitions, error: reqError } = await supabase
        .from('requisitions')
        .select('id, description, status');

    if (reqError) {
        console.error('Error fetching requisitions:', reqError);
        return;
    }

    console.log(`Total requisitions: ${requisitions.length}`);

    // 2. For each requisition, check if it has messages
    let emptyCount = 0;
    for (const req of (requisitions as any[])) {
        const { count, error: msgError } = await supabase
            .from('requisition_messages')
            .select('*', { count: 'exact', head: true })
            .eq('requisition_id', req.id);

        if (msgError) {
            console.error(`Error checking messages for ${req.id}:`, msgError);
            continue;
        }

        if (count === 0) {
            emptyCount++;
            console.log(`[EMPTY] Requisition ${req.id} (Status: ${req.status}) has 0 messages. Description: ${req.description}`);
        }
    }

    console.log(`--- [Check Complete] ---`);
    console.log(`Requisitions with 0 messages: ${emptyCount}`);
}

checkEmptyChats();

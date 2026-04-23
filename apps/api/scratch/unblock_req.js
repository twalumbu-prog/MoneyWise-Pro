
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://klfeluphcutgppkhaxyl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsZmVsdXBoY3V0Z3Bwa2hheHlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDU5NDA0NSwiZXhwIjoyMDgwMTcwMDQ1fQ.2-2e2jhkrE_L9iR2N_q-EFc2bN9x0M4n8ZbdXOiOd5Y';
const supabase = createClient(supabaseUrl, supabaseKey);

const reqId = '2b301453-a9c7-49bc-96ad-5c3a761a276e';
const userId = '005693db-5e94-4e96-8e7d-14620f82ebaa'; // The requestor/system user

async function unblock() {
    console.log('Unblocking requisition ' + reqId);
    
    // Check if the message already exists
    const { data: existing } = await supabase
        .from('requisition_messages')
        .select('id')
        .eq('requisition_id', reqId)
        .eq('metadata->stage', 'EXPENSE_TRACKING')
        .maybeSingle();
        
    if (existing) {
        console.log('Expense tracking message already exists.');
        return;
    }

    const { error } = await supabase
        .from('requisition_messages')
        .insert({
            requisition_id: reqId,
            user_id: userId,
            content: 'Funds received. Please record your expenditure and upload receipts.',
            message_type: 'SYSTEM',
            metadata: { stage: 'EXPENSE_TRACKING' }
        });
        
    if (error) {
        console.error('Error inserting message:', error);
    } else {
        console.log('Successfully inserted EXPENSE_TRACKING message.');
    }
}

unblock();

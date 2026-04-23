
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://klfeluphcutgppkhaxyl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsZmVsdXBoY3V0Z3Bwa2hheHlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDU5NDA0NSwiZXhwIjoyMDgwMTcwMDQ1fQ.2-2e2jhkrE_L9iR2N_q-EFc2bN9x0M4n8ZbdXOiOd5Y';
const supabase = createClient(supabaseUrl, supabaseKey);

async function findByIdFragment() {
    console.log('--- Fetching recent requisitions to filter ---');
    const { data: reqs, error: reqError } = await supabase
        .from('requisitions')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(100);
    
    if (reqError) {
        console.error('Error fetching requisitions:', reqError);
    } else {
        const found = reqs.filter(r => r.id.startsWith('2b301453') || (r.reference_number && r.reference_number.includes('2B301453')));
        console.log('Found matches:', JSON.stringify(found, null, 2));
        
        if (found.length > 0) {
            const reqId = found[0].id;
            console.log('\n--- Recent Messages ---');
            const { data: messages, error: msgError } = await supabase
                .from('requisition_messages')
                .select('*')
                .eq('requisition_id', reqId)
                .order('created_at', { ascending: false })
                .limit(10);
                
            if (msgError) {
                console.error('Error fetching messages:', msgError);
            } else {
                console.log(JSON.stringify(messages, null, 2));
            }
        }
    }
}

findByIdFragment();

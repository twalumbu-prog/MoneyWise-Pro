
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://klfeluphcutgppkhaxyl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsZmVsdXBoY3V0Z3Bwa2hheHlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDU5NDA0NSwiZXhwIjoyMDgwMTcwMDQ1fQ.2-2e2jhkrE_L9iR2N_q-EFc2bN9x0M4n8ZbdXOiOd5Y';
const supabase = createClient(supabaseUrl, supabaseKey);

const reqId = '2b301453-a9c7-49bc-96ad-5c3a761a276e';

async function checkReceipts() {
    console.log('--- Receipts for ' + reqId + ' ---');
    const { data: receipts, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('requisition_id', reqId);
    
    if (error) {
        console.error('Error fetching receipts:', error);
    } else {
        console.log(JSON.stringify(receipts, null, 2));
    }
}

checkReceipts();

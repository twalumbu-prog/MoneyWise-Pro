import { supabase } from './lib/supabase';

async function main() {
  console.log('--- Inspecting Requisition REQ-A8A28EE9 ---');
  
  const { data: req, error } = await supabase
    .from('requisitions')
    .select('*, disbursements(*), line_items(*), requisition_messages(*)')
    .eq('id', 'a8a28ee9-004c-4728-8d72-aa517dd987db')
    .single();
    
  if (error) {
    console.error('Error fetching requisition:', error);
  } else {
    console.log(JSON.stringify(req, null, 2));
  }
}

main().catch(console.error);

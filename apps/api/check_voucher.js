const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: voucher } = await supabase.from('vouchers').select('*').eq('requisition_id', 'da71773c-4371-48b8-afcd-4c3306631eba').single();
  console.log('Voucher:', voucher);
}
run();

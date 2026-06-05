const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reset() {
  const { data, error } = await supabase
    .from('requisitions')
    .update({ status: 'EXPENSED' })
    .eq('id', 'da71773c-4371-48b8-afcd-4c3306631eba')
    .select();
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success:', data);
  }
}

reset();

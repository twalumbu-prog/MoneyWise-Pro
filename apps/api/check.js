const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('--- Organizations List ---');
  const { data: orgs } = await supabase.from('organizations').select('*');
  console.log('Orgs:', orgs);
}

main().catch(console.error);

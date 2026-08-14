import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data, error } = await supabase.from('payroll_staff').select('*').limit(1);
  if (data && data.length > 0) {
     console.log("Columns:", Object.keys(data[0]));
  } else {
     console.log("Data empty or null");
  }
  console.log("Error:", error);
}

test();

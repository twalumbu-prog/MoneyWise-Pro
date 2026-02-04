import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load .env
dotenv.config();

console.log('[Supabase] Loading environment variables...');
console.log('[Supabase] CWD:', process.cwd());

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('[Supabase] CRITICAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.error('[Supabase] Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are set');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from current directory (apps/api)
const result = dotenv.config();

console.log('[Supabase] Loading environment variables...');
console.log('[Supabase] CWD:', process.cwd());
console.log('[Supabase] Dotenv parsed:', result.parsed ? Object.keys(result.parsed) : 'None');
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('[Supabase] CRITICAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    console.error('[Supabase] Please ensure apps/api/.env exists and contains SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

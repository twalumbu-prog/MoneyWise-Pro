import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });
dotenv.config(); // Fallback to CWD

console.log('[Supabase] Loading environment variables...');
console.log('[Supabase] CWD:', process.cwd());
console.log('[Supabase] envPath used:', envPath);

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('[Supabase] CRITICAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.error('[Supabase] Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are set');
}

// Custom fetch wrapper with retry logic for transient DNS/connection errors
const fetchWithRetry = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let lastError: any;
    const retries = 3;
    const delay = 500; // 500ms delay between retries

    for (let i = 0; i < retries; i++) {
        try {
            return await fetch(input, init);
        } catch (err: any) {
            lastError = err;
            const errStr = String(err.message || err);
            if (
                errStr.includes('fetch failed') || 
                errStr.includes('ENOTFOUND') || 
                errStr.includes('ETIMEDOUT') || 
                errStr.includes('ECONNRESET') ||
                errStr.includes('socket hang up')
            ) {
                console.warn(`[Supabase Fetch Retry] Request failed: ${errStr}. Retrying in ${delay}ms... (${retries - i - 1} left)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw err;
        }
    }
    throw lastError;
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
        fetch: fetchWithRetry
    }
});


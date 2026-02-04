import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('--- Diagnosis Start ---');
console.log('URL:', supabaseUrl);
console.log('Key exists:', !!supabaseKey);

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function diagnose() {
    console.log('Testing auth.getUser() with dummy token...');
    try {
        const { data, error } = await supabase.auth.getUser('dummy-token');
        console.log('Result:', { data, error });
    } catch (e: any) {
        console.error('Caught error during getUser():', e.message, e);
    }

    console.log('\nTesting raw fetch to health endpoint...');
    try {
        const res = await fetch(`${supabaseUrl}/auth/v1/health`);
        const text = await res.text();
        console.log('Health Status:', res.status);
        console.log('Health Body:', text);
    } catch (e: any) {
        console.error('Raw fetch failed:', e.message, e);
    }
}

diagnose();

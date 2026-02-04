import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://klfeluphcutgppkhaxyl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsZmVsdXBoY3V0Z3Bwa2hheHlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDU5NDA0NSwiZXhwIjoyMDgwMTcwMDQ1fQ.kIg-jV7l20aW9X8t7_u7tF-i0yX5v6xZ9e8d7s6h4j8';

console.log('Testing Supabase Connection...');
console.log('URL:', supabaseUrl);
console.log('Key (first 10 chars):', supabaseKey.substring(0, 10) + '...');

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    try {
        // Try to list users (requires service role)
        const { data, error } = await supabase.auth.admin.listUsers();

        if (error) {
            console.error('FAILED:', error.message);
            console.error('Full Error:', error);
        } else {
            console.log('SUCCESS! Connection Verified.');
            console.log('User count:', data.users.length);
        }
    } catch (err: any) {
        console.error('EXCEPTION:', err.message);
    }
}

testConnection();

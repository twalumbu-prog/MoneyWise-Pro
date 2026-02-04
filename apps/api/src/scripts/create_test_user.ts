
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestUser() {
    const email = 'testuser_verified@example.com';
    const password = 'Password123!';

    console.log(`Creating user ${email}...`);

    // Check if exists first
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users.find(u => u.email === email);

    if (existing) {
        console.log('User already exists, deleting...');
        await supabase.auth.admin.deleteUser(existing.id);
    }

    const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });

    if (error) {
        console.error('Error creating user:', error);
        process.exit(1);
    }

    console.log('User created successfully:', data.user.id);
}

createTestUser();

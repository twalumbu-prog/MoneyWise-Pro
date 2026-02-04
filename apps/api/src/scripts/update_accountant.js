#!/usr/bin/env node

/**
 * Simple script to update user role using Supabase REST API directly
 * This bypasses the need for @supabase/supabase-js package which may have network issues
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables manually
const envPath = path.resolve(__dirname, '../../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
        env[key.trim()] = valueParts.join('=').trim();
    }
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const email = 'testuser_verified@example.com';

console.log(`🔍 Looking for user: ${email}...`);

// Step 1: Get all users from auth.admin.users
const listUsersOptions = {
    hostname: SUPABASE_URL.replace('https://', '').replace('http://', ''),
    path: '/auth/v1/admin/users',
    method: 'GET',
    headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    timeout: 30000
};

https.get(listUsersOptions, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        if (res.statusCode !== 200) {
            console.error(`❌ Error listing users: ${res.statusCode} ${data}`);
            process.exit(1);
        }

        const response = JSON.parse(data);
        const users = response.users || [];
        const authUser = users.find(u => u.email === email);

        if (!authUser) {
            console.error(`❌ User not found in auth.users: ${email}`);
            process.exit(1);
        }

        console.log(`✅ Found user in auth.users: ${authUser.id}`);

        // Step 2: Update the user in public.users table
        const updateOptions = {
            hostname: SUPABASE_URL.replace('https://', '').replace('http://', ''),
            path: `/rest/v1/users?id=eq.${authUser.id}`,
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            timeout: 30000
        };

        const updateData = JSON.stringify({ role: 'ACCOUNTANT' });

        const updateReq = https.request(updateOptions, (updateRes) => {
            let updateData = '';

            updateRes.on('data', (chunk) => {
                updateData += chunk;
            });

            updateRes.on('end', () => {
                if (updateRes.statusCode === 200 || updateRes.statusCode === 201) {
                    const result = JSON.parse(updateData);
                    console.log('✅ User role updated to ACCOUNTANT');
                    console.log('');
                    console.log('✅ Final user state:');
                    if (result && result.length > 0) {
                        console.log('  ID:', result[0].id);
                        console.log('  Email:', result[0].email);
                        console.log('  Name:', result[0].name);
                        console.log('  Role:', result[0].role);
                    }
                    console.log('');
                    console.log('🎉 Done! The user can now access the accountant view.');
                } else if (updateRes.statusCode === 404 || updateRes.statusCode === 406) {
                    console.log('⚠️  User not found in public.users table, trying to insert...');

                    // Try to insert the user
                    const insertOptions = {
                        hostname: SUPABASE_URL.replace('https://', '').replace('http://', ''),
                        path: '/rest/v1/users',
                        method: 'POST',
                        headers: {
                            'apikey': SUPABASE_SERVICE_ROLE_KEY,
                            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=representation'
                        },
                        timeout: 30000
                    };

                    const insertData = JSON.stringify({
                        id: authUser.id,
                        email: authUser.email,
                        name: authUser.user_metadata?.full_name || 'Test User',
                        role: 'ACCOUNTANT',
                        employee_id: null
                    });

                    const insertReq = https.request(insertOptions, (insertRes) => {
                        let insertResData = '';

                        insertRes.on('data', (chunk) => {
                            insertResData += chunk;
                        });

                        insertRes.on('end', () => {
                            if (insertRes.statusCode === 200 || insertRes.statusCode === 201) {
                                console.log('✅ User created in public.users with ACCOUNTANT role');
                                const result = JSON.parse(insertResData);
                                console.log('');
                                console.log('✅ Final user state:');
                                if (result && result.length > 0) {
                                    console.log('  ID:', result[0].id);
                                    console.log('  Email:', result[0].email);
                                    console.log('  Name:', result[0].name);
                                    console.log('  Role:', result[0].role);
                                }
                                console.log('');
                                console.log('🎉 Done! The user can now access the accountant view.');
                            } else {
                                console.error(`❌ Error inserting user: ${insertRes.statusCode} ${insertResData}`);
                                process.exit(1);
                            }
                        });
                    });

                    insertReq.on('error', (e) => {
                        console.error(`❌ Error inserting user: ${e.message}`);
                        process.exit(1);
                    });

                    insertReq.write(insertData);
                    insertReq.end();
                } else {
                    console.error(`❌ Error updating user: ${updateRes.statusCode} ${updateData}`);
                    process.exit(1);
                }
            });
        });

        updateReq.on('error', (e) => {
            console.error(`❌ Error updating user: ${e.message}`);
            process.exit(1);
        });

        updateReq.write(updateData);
        updateReq.end();
    });
}).on('error', (e) => {
    console.error(`❌ Error connecting to Supabase: ${e.message}`);
    console.error('');
    console.error('Please check:');
    console.error('  1. Your internet connection');
    console.error('  2. SUPABASE_URL is correct');
    console.error('  3. SUPABASE_SERVICE_ROLE_KEY is valid');
    process.exit(1);
});

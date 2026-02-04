#!/usr/bin/env node

/**
 * Create test user with ACCOUNTANT role
 * This is a combined script that creates the user and sets their role
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
const password = 'Password123!';

console.log(`🔐 Creating test user: ${email}...`);

function makeRequest(options, data, callback) {
    const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
            responseData += chunk;
        });

        res.on('end', () => {
            callback(null, res, responseData);
        });
    });

    req.on('error', (e) => {
        callback(e);
    });

    if (data) {
        req.write(data);
    }
    req.end();
}

// Step 1: Check if user already exists and delete if so
console.log('📋 Checking for existing user...');

const listOptions = {
    hostname: SUPABASE_URL.replace('https://', '').replace('http://', ''),
    path: '/auth/v1/admin/users',
    method: 'GET',
    headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    timeout: 30000
};

makeRequest(listOptions, null, (err, res, data) => {
    if (err) {
        console.error(`❌ Error checking for existing user: ${err.message}`);
        process.exit(1);
    }

    if (res.statusCode !== 200) {
        console.error(`❌ Error listing users: ${res.statusCode} ${data}`);
        process.exit(1);
    }

    const response = JSON.parse(data);
    const users = response.users || [];
    const existingUser = users.find(u => u.email === email);

    if (existingUser) {
        console.log('⚠️  User already exists, deleting...');

        const deleteOptions = {
            hostname: SUPABASE_URL.replace('https://', '').replace('http://', ''),
            path: `/auth/v1/admin/users/${existingUser.id}`,
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            timeout: 30000
        };

        makeRequest(deleteOptions, null, (delErr, delRes, delData) => {
            if (delErr || (delRes.statusCode !== 200 && delRes.statusCode !== 204)) {
                console.error(`❌ Error deleting user: ${delErr ? delErr.message : delRes.statusCode}`);
            } else {
                console.log('✅ Existing user deleted');
            }
            createUser();
        });
    } else {
        console.log('✅ No existing user found');
        createUser();
    }
});

function createUser() {
    console.log('👤 Creating new user...');

    const createOptions = {
        hostname: SUPABASE_URL.replace('https://', '').replace('http://', ''),
        path: '/auth/v1/admin/users',
        method: 'POST',
        headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
        },
        timeout: 30000
    };

    const createData = JSON.stringify({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: {
            full_name: 'Test Accountant User'
        }
    });

    makeRequest(createOptions, createData, (err, res, data) => {
        if (err) {
            console.error(`❌ Error creating user: ${err.message}`);
            process.exit(1);
        }

        if (res.statusCode !== 200 && res.statusCode !== 201) {
            console.error(`❌ Error creating user: ${res.statusCode} ${data}`);
            process.exit(1);
        }

        const newUser = JSON.parse(data);
        console.log(`✅ User created successfully: ${newUser.id}`);
        console.log('');
        console.log('  Email:', email);
        console.log('  Password:', password);
        console.log('');

        // Now set the accountant role
        setAccountantRole(newUser.id);
    });
}

function setAccountantRole(userId) {
    console.log('🔧 Setting ACCOUNTANT role...');

    // First, try to update existing record
    const updateOptions = {
        hostname: SUPABASE_URL.replace('https://', '').replace('http://', ''),
        path: `/rest/v1/users?id=eq.${userId}`,
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

    makeRequest(updateOptions, updateData, (err, res, data) => {
        if (err) {
            console.error(`❌ Error setting role: ${err.message}`);
            process.exit(1);
        }

        if (res.statusCode === 200 || res.statusCode === 201) {
            try {
                const result = JSON.parse(data);
                if (result && result.length > 0) {
                    console.log('✅ User role set to ACCOUNTANT');
                    printSuccess(result[0]);
                    return;
                }
            } catch (e) {
                // Fall through to insert
            }
        }

        // If update didn't work, try insert
        console.log('⚠️  Record not found in public.users, creating...');

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
            id: userId,
            email: email,
            name: 'Test Accountant User',
            role: 'ACCOUNTANT',
            employee_id: null
        });

        makeRequest(insertOptions, insertData, (insertErr, insertRes, insertData) => {
            if (insertErr) {
                console.error(`❌ Error creating user record: ${insertErr.message}`);
                process.exit(1);
            }

            if (insertRes.statusCode === 200 || insertRes.statusCode === 201) {
                const result = JSON.parse(insertData);
                console.log('✅ User record created with ACCOUNTANT role');
                printSuccess(result[0] || result);
            } else {
                console.error(`❌ Error creating user record: ${insertRes.statusCode} ${insertData}`);
                process.exit(1);
            }
        });
    });
}

function printSuccess(user) {
    console.log('');
    console.log('🎉 Success! Test user is ready:');
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ID:', user.id || 'N/A');
    console.log('  Email:', user.email || email);
    console.log('  Name:', user.name || 'Test Accountant User');
    console.log('  Role:', user.role || 'ACCOUNTANT');
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📝 Login credentials:');
    console.log('  Email:', email);
    console.log('  Password:', password);
    console.log('');
    console.log('✨ The user can now access the accountant view!');
}

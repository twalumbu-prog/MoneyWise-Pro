
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from the root of apps/api or where the .env is located
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const API_URL = 'http://localhost:3000';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY env vars');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    if (error) throw error;
    return data.session?.access_token;
}

async function runTest() {
    console.log('--- Starting API E2E Disbursement Test ---');

    let requestorToken = '';
    let accountantToken = '';
    let cashierToken = '';
    let requisitionId = '';

    // 1. Login Requestor
    try {
        console.log('1. Logging in Requestor...');
        requestorToken = await login('requestor1@example.com', 'RequestorPassword123!');
        console.log('   Requestor logged in.');
    } catch (e) {
        console.error('FAILED Login Requestor:', e);
        process.exit(1);
    }

    // 2. Create Requisition
    try {
        console.log('2. Creating Requisition...');
        const res = await fetch(`${API_URL}/requisitions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${requestorToken}`
            },
            body: JSON.stringify({
                description: 'API E2E Test Lunch',
                estimated_total: 100,
                items: [
                    { description: 'Sandwich', quantity: 2, unit_price: 50, estimated_amount: 100 }
                ]
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || JSON.stringify(data));
        requisitionId = data.id;
        console.log(`   Requisition Created: ${requisitionId} (Total: ${data.estimated_total})`);
    } catch (e) {
        console.error('FAILED Create Requisition:', e);
        process.exit(1);
    }

    // 3. Login Accountant
    try {
        console.log('3. Logging in Accountant...');
        accountantToken = await login('accountant1@example.com', 'AccountantPassword123!');
        console.log('   Accountant logged in.');
    } catch (e) {
        console.error('FAILED Login Accountant:', e);
        process.exit(1);
    }

    // 4. Approve Requisition
    try {
        console.log('4. Approving Requisition...');
        const res = await fetch(`${API_URL}/requisitions/${requisitionId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accountantToken}`
            },
            body: JSON.stringify({ status: 'AUTHORISED' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        console.log(`   Requisition Approved. Status: ${data.status}`);
    } catch (e) {
        console.error('FAILED Approve Requisition:', e);
        process.exit(1);
    }

    // 5. Login Cashier
    try {
        console.log('5. Logging in Cashier...');
        cashierToken = await login('cashier1@example.com', 'CashierPassword123!');
        console.log('   Cashier logged in.');
    } catch (e) {
        console.error('FAILED Login Cashier:', e);
        process.exit(1);
    }

    // 6. Disburse Funds
    try {
        console.log('6. Disbursing Funds...');
        const res = await fetch(`${API_URL}/requisitions/${requisitionId}/disburse`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cashierToken}`
            },
            body: JSON.stringify({
                total_prepared: 100,
                denominations: { '50': 2 }
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        console.log('   Requisition Disbursed.');
    } catch (e) {
        console.error('FAILED Disburse Funds:', e);
        process.exit(1);
    }

    // 7. Acknowledge Receipt (Requestor)
    try {
        console.log('7. Acknowledging Receipt (Requestor)...');
        const res = await fetch(`${API_URL}/requisitions/${requisitionId}/acknowledge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${requestorToken}`
            },
            body: JSON.stringify({
                signature: 'REQUESTOR_SIG_TEST'
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        console.log(`   Receipt Acknowledged. Requisition Status: ${data.status}`);

        if (data.status === 'RECEIVED') {
            console.log('\n*** ALL TESTS PASSED SUCCESSFULLY ***');
        } else {
            console.error('FAILED: Final status is not RECEIVED');
            process.exit(1);
        }

    } catch (e) {
        console.error('FAILED Acknowledge Receipt:', e);
        process.exit(1);
    }
}

runTest();


import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
// Native fetch is available in Node 18+

dotenv.config({ path: path.join(__dirname, '../../.env') });

const API_URL = 'http://localhost:3000';
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const login = async (email: string, password: string) => {
    // Force reset password to ensure test stability
    await supabase.auth.admin.updateUserById(
        (await supabase.rpc('get_user_id_by_email', { email_input: email })).data ||
        // Fallback if RPC missing: get list (inefficient but works for test)
        (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === email)?.id!,
        { password: password }
    );

    // Actually, simpler: just update by email? No, updateUserById is safer.
    // Wait, Supabase Admin API: updateUserById(uid, attributes)
    // Finding UID is the trick.
    // Let's use listUsers filtering.

    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users.users.find(u => u.email === email);
    if (user) {
        await supabase.auth.admin.updateUserById(user.id, { password: password });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    if (error) throw error;
    return data.session?.access_token;
};

const runTest = async () => {
    console.log('--- Starting API E2E Expense Tracking Test ---');

    try {
        // 1. Requestor Login
        console.log('1. Logging in Requestor...');
        const requestorToken = await login('requestor1@example.com', 'password123'); // Ensure this user exists
        console.log('   Requestor logged in.');

        // 2. Create Requisition
        console.log('2. Creating Requisition...');
        const createRes = await fetch(`${API_URL}/requisitions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${requestorToken}`
            },
            body: JSON.stringify({
                description: 'Office Supplies for Expense Test',
                estimated_total: 100,
                items: [
                    { description: 'Printer Paper', quantity: 5, unit_price: 10, estimated_amount: 50 },
                    { description: 'Ink Cartridge', quantity: 1, unit_price: 50, estimated_amount: 50 }
                ]
            })
        });
        const requisition: any = await createRes.json();
        if (!createRes.ok) throw new Error(`Create failed: ${JSON.stringify(requisition)}`);
        console.log(`   Requisition Created: ${requisition.id} (Total: ${requisition.estimated_total})`);

        // 3. Accountant Login & Approve
        console.log('3. Logging in Accountant...');
        const accountantToken = await login('accountant1@example.com', 'password123');
        console.log('   Accountant logged in.');

        console.log('4. Approving Requisition...');
        const approveRes = await fetch(`${API_URL}/requisitions/${requisition.id}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accountantToken}`
            },
            body: JSON.stringify({ status: 'AUTHORISED' })
        });
        if (!approveRes.ok) throw new Error('Approval failed');
        console.log('   Requisition Approved. Status: AUTHORISED');

        // 4. Cashier Login & Disburse
        console.log('5. Logging in Cashier...');
        const cashierToken = await login('cashier1@example.com', 'password123');

        console.log('6. Disbursing Funds...');
        const disburseRes = await fetch(`${API_URL}/requisitions/${requisition.id}/disburse`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cashierToken}`
            },
            body: JSON.stringify({
                total_prepared: 100,
                denominations: { "50": 2 }
            })
        });
        if (!disburseRes.ok) {
            const err: any = await disburseRes.json();
            throw new Error(`Disburse failed: ${err.error}`);
        }
        console.log('   Requisition Disbursed.');

        // 5. Requestor Acknowledge
        console.log('7. Acknowledging Receipt (Requestor)...');
        const ackRes = await fetch(`${API_URL}/requisitions/${requisition.id}/acknowledge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${requestorToken}`
            },
            body: JSON.stringify({ signature: 'REQ_SIG_TEST' })
        });
        if (!ackRes.ok) throw new Error('Acknowledge failed');
        console.log('   Receipt Acknowledged.');

        // 6. Update Expenses (THE NEW PART)
        console.log('8. Updating Expenses...');
        // Need to get line item IDs first
        const refreshRes = await fetch(`${API_URL}/requisitions/${requisition.id}`, {
            headers: { 'Authorization': `Bearer ${requestorToken}` }
        });
        const refreshedReq: any = await refreshRes.json();
        const items = refreshedReq.items;

        const expenseUpdateBody = {
            items: items.map((item: any) => ({
                id: item.id,
                actual_amount: item.estimated_amount + 5, // Simulating overspend
                receipt_url: 'https://example.com/receipt.jpg'
            }))
        };

        const expenseRes = await fetch(`${API_URL}/requisitions/${requisition.id}/expenses`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${requestorToken}`
            },
            body: JSON.stringify(expenseUpdateBody)
        });

        const expenseResult: any = await expenseRes.json();
        if (!expenseRes.ok) throw new Error(`Expense update failed: ${JSON.stringify(expenseResult)}`);

        console.log(`   Expenses Updated. Message: ${expenseResult.message}`);
        console.log(`   New Actual Total: ${expenseResult.actual_total}`);

        if (expenseResult.actual_total !== 110) {
            throw new Error(`Expected Actual Total 110, got ${expenseResult.actual_total}`);
        }

        console.log('\n*** EXPENSE TRACKING VERIFIED SUCCESSFULLY ***');

    } catch (error: any) {
        console.error('FAILED:', error.message);
        process.exit(1);
    }
};

runTest();

import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = 'https://api.lenco.co/access/v2';
const secretKey = process.env.LENCO_SECRET_KEY!;

async function testInternalTransfer() {
    const amount = 1;
    const fromAccount = 'df2ff8c6-eebf-4e53-923e-986c970e6794'; // Blue Opus
    const toAccount = '2af6bb1a-626c-474e-a9de-b9414967ddd0'; // Twalumbu
    
    // Test format 3: /transfers/bank-account with recipientId
    try {
        console.log('\nTesting /transfers/bank-account with recipientId...');
        const res = await axios.post(`${BASE_URL}/transfers/bank-account`, {
            accountId: fromAccount,
            recipientId: toAccount,
            amount: amount,
            reference: `SWEEP-${Date.now()}`,
            narration: 'Sweep to subaccount'
        }, {
            headers: { Authorization: `Bearer ${secretKey}` }
        });
        console.log('Success (format 3):', res.data);
        return;
    } catch (err: any) {
        console.error('Format 3 failed:', err.response?.data || err.message);
    }

    // Test format 4: /transactions
    try {
        console.log('\nTesting /transactions...');
        const res = await axios.post(`${BASE_URL}/transactions`, {
            accountId: fromAccount,
            recipientId: toAccount,
            amount: amount,
            reference: `SWEEP-${Date.now()}`,
            narration: 'Sweep to subaccount'
        }, {
            headers: { Authorization: `Bearer ${secretKey}` }
        });
        console.log('Success (format 4):', res.data);
        return;
    } catch (err: any) {
        console.error('Format 4 failed:', err.response?.data || err.message);
    }
}

testInternalTransfer();

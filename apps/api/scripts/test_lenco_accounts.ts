import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = 'https://api.lenco.co/access/v2';
const secretKey = process.env.LENCO_SECRET_KEY!;

async function testInternalTransfer() {
    try {
        console.log('Fetching accounts...');
        const accountsRes = await axios.get(`${BASE_URL}/accounts`, {
            headers: { Authorization: `Bearer ${secretKey}` }
        });
        
        console.log('Accounts Object structure (first account):');
        console.log(JSON.stringify(accountsRes.data.data[0], null, 2));

        console.log('\nAll Accounts List:');
        for (const acc of accountsRes.data.data) {
            console.log(`- Name: ${acc.accountName || acc.name} | NUBAN: ${acc.accountNumber} | ID: ${acc.id} | Bal: ${acc.availableBalance}`);
        }
        
    } catch (err: any) {
        console.error('API Error:', err.response?.data || err.message);
    }
}

testInternalTransfer();

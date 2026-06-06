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
        
        console.log('\nAll Accounts Details:');
        console.log(JSON.stringify(accountsRes.data.data, null, 2));
    } catch (err: any) {
        console.error('API Error:', err.response?.data || err.message);
    }
}

testInternalTransfer();

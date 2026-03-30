import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = 'https://api.lenco.co/access/v2';
const secretKey = process.env.LENCO_SECRET_KEY!;

async function checkBalances() {
    const fromAccount = 'df2ff8c6-eebf-4e53-923e-986c970e6794'; // Blue Opus
    const toAccount = '2af6bb1a-626c-474e-a9de-b9414967ddd0'; // Twalumbu
    
    try {
        console.log('Checking Blue Opus Balance...');
        const res1 = await axios.get(`${BASE_URL}/accounts/${fromAccount}/balance`, {
            headers: { Authorization: `Bearer ${secretKey}` }
        });
        console.log('Blue Opus Balance:', res1.data.data);
    } catch (err: any) {
        console.error('Failed Blue Opus:', err.response?.data || err.message);
    }

    try {
        console.log('\nChecking Twalumbu Balance...');
        const res2 = await axios.get(`${BASE_URL}/accounts/${toAccount}/balance`, {
            headers: { Authorization: `Bearer ${secretKey}` }
        });
        console.log('Twalumbu Balance:', res2.data.data);
    } catch (err: any) {
        console.error('Failed Twalumbu:', err.response?.data || err.message);
    }
}

checkBalances();

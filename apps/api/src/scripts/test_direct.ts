
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const host = 'aws-0-eu-central-1.pooler.supabase.com';
const password = 'jwBDdE8HbNoiMFBz';
const tenant = 'klfeluphcutgppkhaxyl';
const directUrl = `postgresql://postgres.${tenant}:${password}@${host}:5432/postgres`;

const pool = new Pool({
    connectionString: directUrl,
    ssl: { rejectUnauthorized: false }
});

async function testDirect() {
    try {
        console.log('Testing direct connection to:', host);
        const res = await pool.query('SELECT NOW()');
        console.log('Success!', res.rows[0]);
    } catch (err: any) {
        console.error('Failed:', err.message);
    } finally {
        await pool.end();
    }
}

testDirect();

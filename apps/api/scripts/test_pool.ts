
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const password = 'jwBDdE8HbNoiMFBz';
const host = 'aws-0-eu-central-1.pooler.supabase.com';
const directUrl = `postgresql://postgres:${password}@${host}:6543/postgres`;

const pool = new Pool({
    connectionString: directUrl,
});

async function testConnection() {
    try {
        console.log('Testing pooled connection...');
        console.log('URL:', process.env.DATABASE_URL?.split('@')[1]);
        const res = await pool.query('SELECT NOW()');
        console.log('Success! Current time from DB:', res.rows[0]);
    } catch (err: any) {
        console.error('Connection failed:', err.message);
    } finally {
        await pool.end();
    }
}

testConnection();

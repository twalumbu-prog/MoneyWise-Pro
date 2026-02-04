
import { Client } from 'pg';

const PROJECT_REF = 'klfeluphcutgppkhaxyl';
const PASSWORD = 'jwBDdE8HbNoiMFBz';
const POOLER_HOST = 'aws-0-eu-central-1.pooler.supabase.com';

async function testConnection() {
    const config = {
        connectionString: `postgresql://postgres.${PROJECT_REF}:${PASSWORD}@${POOLER_HOST}:5432/postgres`,
        ssl: { rejectUnauthorized: false }
    };

    const client = new Client(config);
    try {
        console.log('Testing Pooler Host on Port 5432...');
        await client.connect();
        const res = await client.query('SELECT current_database(), current_user;');
        console.log('Result:', res.rows[0]);
        console.log('Connection successful!');
    } catch (err: any) {
        console.error('Connection failed:', err.message);
    } finally {
        await client.end();
    }
}

testConnection();

const { Client } = require('pg');
const connectionString = 'postgresql://postgres.klfeluphcutgppkhaxyl:jwBDdE8HbNoiMFBz@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

async function test() {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });
    try {
        console.log('Connecting to pooler...');
        await client.connect();
        console.log('Connected successfully!');
        const res = await client.query('SELECT current_database(), current_user;');
        console.log('Result:', res.rows[0]);
    } catch (err) {
        console.error('Connection failed:', err.message || err);
    } finally {
        await client.end();
    }
}

test();


import { Client } from 'pg';

const directUrl = 'postgresql://postgres:jwBDdE8HbNoiMFBz@db.klfeluphcutgppkhaxyl.supabase.co:5432/postgres';

async function testConnection() {
    const client = new Client({
        connectionString: directUrl,
    });

    try {
        console.log('Connecting directly to Supabase...');
        await client.connect();
        console.log('Connection successful!');

        const res = await client.query('SELECT current_database(), current_user;');
        console.log('Result:', res.rows[0]);
    } catch (err) {
        console.error('Direct connection failed:', err);
    } finally {
        await client.end();
    }
}

testConnection();

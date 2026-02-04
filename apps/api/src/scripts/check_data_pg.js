const { Client } = require('pg');

const connectionString = 'postgresql://postgres.klfeluphcutgppkhaxyl:jwBDdE8HbNoiMFBz@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

async function check() {
    const client = new Client({ connectionString });
    try {
        await client.connect();

        console.log('--- RECENT USERS ---');
        const users = await client.query('SELECT id, email, role FROM users ORDER BY created_at DESC LIMIT 10');
        console.table(users.rows);

        console.log('\n--- RECENT REQUISITIONS ---');
        const reqs = await client.query('SELECT id, description, status, created_at FROM requisitions ORDER BY created_at DESC LIMIT 10');
        console.table(reqs.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

check();

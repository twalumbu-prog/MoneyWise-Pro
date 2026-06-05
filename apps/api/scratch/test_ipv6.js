const { Client } = require('pg');

async function test() {
    const client = new Client({
        host: '2a05:d014:1c06:5f36:c5:db69:3c39:1af5',
        port: 5432,
        user: 'postgres',
        password: 'jwBDdE8HbNoiMFBz',
        database: 'postgres',
        ssl: { rejectUnauthorized: false }
    });
    try {
        console.log('Connecting to IPv6 directly...');
        await client.connect();
        console.log('Connected successfully!');
        const res = await client.query('SELECT current_database(), current_user;');
        console.log('Result:', res.rows[0]);
    } catch (err) {
        console.error('Connection failed:', err.message || err);
    } finally {
        await client.end().catch(() => {});
    }
}

test();

const { Client } = require('pg');
require('dotenv').config({ path: '../../.env' });

async function checkVouchers() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to database');

        const vRes = await client.query('SELECT * FROM vouchers ORDER BY created_at DESC LIMIT 5');
        console.log('\n--- Vouchers ---');
        console.table(vRes.rows);

        if (vRes.rows.length > 0) {
            const vId = vRes.rows[0].id;
            const lRes = await client.query('SELECT * FROM voucher_lines WHERE voucher_id = $1', [vId]);
            console.log(`\n--- Voucher Lines for ${vId} ---`);
            console.table(lRes.rows);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

checkVouchers();

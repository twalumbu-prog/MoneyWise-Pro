const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'src/db/migrations/20260301_add_org_to_cashbook.sql'), 'utf8');
        console.log('Running migration...');
        await pool.query(sql);
        console.log('Success!');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

run();

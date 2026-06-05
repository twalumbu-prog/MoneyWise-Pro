const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../apps/api/.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, '../apps/api/src/db/migrations/20260605110000_add_user_organizations.sql'), 'utf8');
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

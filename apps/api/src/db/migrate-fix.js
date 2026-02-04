const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DIRECT_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const sql = `
-- Update entry_type check constraint to include CLOSING_BALANCE
ALTER TABLE cashbook_entries
DROP CONSTRAINT IF EXISTS cashbook_entries_entry_type_check;

ALTER TABLE cashbook_entries
ADD CONSTRAINT cashbook_entries_entry_type_check 
CHECK (entry_type IN ('DISBURSEMENT', 'RETURN', 'ADJUSTMENT', 'OPENING_BALANCE', 'CLOSING_BALANCE'));
`;

async function migrate() {
    try {
        console.log('Connecting to database...');
        await pool.query('SELECT 1'); // Test connection
        console.log('Connected successfully.');

        console.log('Running migration...');
        await pool.query(sql);
        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

migrate();

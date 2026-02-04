
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const password = 'jwBDdE8HbNoiMFBz';
const tenant = 'klfeluphcutgppkhaxyl';
const host = 'aws-0-eu-central-1.pooler.supabase.com';
const directUrl = `postgresql://postgres.${tenant}:${password}@${host}:5432/postgres`;

const pool = new Pool({
    connectionString: directUrl,
    ssl: { rejectUnauthorized: false }
});

async function runForceMigration() {
    try {
        console.log('Force applying migration to disbursements table...');
        await pool.query(`
            ALTER TABLE disbursements 
            ADD COLUMN IF NOT EXISTS returned_denominations JSONB,
            ADD COLUMN IF NOT EXISTS actual_change_amount NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS confirmed_denominations JSONB,
            ADD COLUMN IF NOT EXISTS confirmed_change_amount NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id),
            ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS discrepancy_amount NUMERIC DEFAULT 0;
        `);

        console.log('Checking for status column in "cashbook_entries" table...');
        await pool.query(`
            ALTER TABLE cashbook_entries 
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED';
        `);

        console.log('Migration complete!');
    } catch (err: any) {
        console.error('Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

runForceMigration();

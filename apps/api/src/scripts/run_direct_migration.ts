
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const directUrl = process.env.DIRECT_DATABASE_URL;

async function runStandaloneMigration() {
    if (!directUrl) {
        console.error('DIRECT_DATABASE_URL not found in .env');
        return;
    }

    console.log('Using URL:', directUrl.split('@')[1]);
    const pool = new Pool({
        connectionString: directUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('Force applying migration...');
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

        await pool.query(`
            ALTER TABLE cashbook_entries 
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED';
        `);

        console.log('Migration successful!');
    } catch (err: any) {
        console.error('Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

runStandaloneMigration();

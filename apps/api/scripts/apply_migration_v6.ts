
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const migration = `
-- 1. Add columns to disbursements
ALTER TABLE disbursements 
ADD COLUMN IF NOT EXISTS returned_denominations JSONB,
ADD COLUMN IF NOT EXISTS actual_change_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS confirmed_denominations JSONB,
ADD COLUMN IF NOT EXISTS confirmed_change_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS discrepancy_amount NUMERIC DEFAULT 0;
`;

async function apply() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('DATABASE_URL not found in .env');
        return;
    }

    console.log('Connecting to database using postgresjs...');
    const sql = postgres(databaseUrl, {
        ssl: 'require',
        connect_timeout: 10,
    });

    try {
        await sql.unsafe(migration);
        console.log('Migration applied successfully using postgresjs');
    } catch (err: any) {
        console.error('Migration failed:', err.message);
    } finally {
        await sql.end();
    }
}

apply();

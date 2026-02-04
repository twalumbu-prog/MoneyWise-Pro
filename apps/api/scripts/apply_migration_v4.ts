
import { Client } from 'pg';
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
    const projectRef = 'klfeluphcutgppkhaxyl';
    const password = 'jwBDdE8HbNoiMFBz';
    const directUrl = `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`;

    console.log('Using direct host: db.klfeluphcutgppkhaxyl.supabase.co:5432');

    const client = new Client({
        connectionString: directUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to database (Direct Host)');
        await client.query(migration);
        console.log('Migration applied successfully');
    } catch (err: any) {
        console.error('Error applying migration:', err.message);
    } finally {
        await client.end();
    }
}

apply();

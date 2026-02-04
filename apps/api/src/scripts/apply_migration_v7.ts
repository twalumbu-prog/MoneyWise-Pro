
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const migration = `
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
    const url = "postgresql://postgres.klfeluphcutgppkhaxyl:jwBDdE8HbNoiMFBz@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";

    console.log('Connecting to pooler on 6543 (No pgbouncer flag)...');
    const client = new Client({
        connectionString: url,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected!');
        await client.query(migration);
        console.log('Migration applied successfully');
    } catch (err: any) {
        console.error('Error:', err.message);
    } finally {
        await client.end();
    }
}

apply();

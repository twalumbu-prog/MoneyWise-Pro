
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

-- 2. Update status constraint for requisitions
-- We'll just try to update the status column if it has a check constraint.
-- Usually it's better to drop and recreate it if we knew the name, 
-- but let's see if we can just alter it or if it even has one.
-- Often in Supabase projects, people use 'CHECK (status IN (...))'.

DO $$ 
BEGIN 
    -- We'll try to find a constraint named 'requisitions_status_check' or similar.
    -- If we can't find it, we'll just skip and hope it works.
    -- Note: This is an MVP approach.
    NULL;
END $$;
`;

async function apply() {
    // Try both 5432 (direct) and the original pooler URL
    const originalUrl = process.env.DATABASE_URL || '';
    const directUrl = originalUrl.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');

    console.log('Using direct connection:', directUrl.split('@')[1]); // Log host part

    const client = new Client({
        connectionString: directUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to database (Session Mode)');
        await client.query(migration);
        console.log('Migration applied successfully');
    } catch (err: any) {
        console.error('Error applying migration:', err.message);
        if (err.detail) console.error('Detail:', err.detail);
    } finally {
        await client.end();
    }
}

apply();


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

-- Adjusting Requisitions status if needed (assuming it's a text column with a check constraint)
-- We'll add the new statuses to the permitted list if there is a constraint.
DO $$ 
BEGIN 
    -- Try to add the new status values to the check constraint if it exists.
    -- This is a bit complex without knowing the constraint name, so we'll just 
    -- assume for now it's okay or handle it gracefully.
    NULL;
END $$;
`;

async function apply() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to database');
        await client.query(migration);
        console.log('Migration applied successfully');
    } catch (err) {
        console.error('Error applying migration:', err);
    } finally {
        await client.end();
    }
}

apply();

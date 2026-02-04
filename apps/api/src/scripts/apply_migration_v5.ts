
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function apply() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to database');

        const statements = [
            `ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS returned_denominations JSONB`,
            `ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS actual_change_amount NUMERIC DEFAULT 0`,
            `ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS confirmed_denominations JSONB`,
            `ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS confirmed_change_amount NUMERIC DEFAULT 0`,
            `ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id)`,
            `ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE`,
            `ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS discrepancy_amount NUMERIC DEFAULT 0`,
            `ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS placeholder_to_test_status BOOLEAN` // Just to test if we can modify requisitions
        ];

        for (const sql of statements) {
            console.log('Executing:', sql);
            await client.query(sql);
        }

        console.log('Migration applied successfully');
    } catch (err: any) {
        console.error('Error applying migration:', err.message);
        if (err.detail) console.error('Detail:', err.detail);
    } finally {
        await client.end();
    }
}

apply();

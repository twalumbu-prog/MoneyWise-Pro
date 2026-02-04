import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const migrate = async () => {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is missing in .env');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    const client = await pool.connect();

    try {
        console.log('Running cashbook schema migration...');

        const sql = `
            ALTER TABLE cashbook_entries 
            ADD COLUMN IF NOT EXISTS entry_type VARCHAR(50) CHECK (entry_type IN ('DISBURSEMENT', 'RETURN', 'ADJUSTMENT', 'OPENING_BALANCE')),
            ADD COLUMN IF NOT EXISTS requisition_id UUID REFERENCES requisitions(id),
            ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

            -- Ensure accounts table has the category column as used in AI classification
            -- Using chart_of_accounts if accounts doesn't exist, but schema shows 'accounts' is referenced by voucher_lines
            -- Let's check which table exists.
        `;

        await client.query(sql);
        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
};

migrate();

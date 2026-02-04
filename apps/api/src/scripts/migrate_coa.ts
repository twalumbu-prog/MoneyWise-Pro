
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
    console.log('Connecting to database...');
    try {
        await client.connect();
        console.log('Connected.');

        const query = `
            -- Create accounts table
            CREATE TABLE IF NOT EXISTS accounts (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              code TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL,
              type TEXT NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
              description TEXT,
              is_active BOOLEAN DEFAULT TRUE,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            -- Update line_items to include account_id
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='line_items' AND column_name='account_id') THEN
                    ALTER TABLE line_items ADD COLUMN account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
                END IF;
            END $$;

            -- Create index for performance
            CREATE INDEX IF NOT EXISTS idx_accounts_code ON accounts(code);
            CREATE INDEX IF NOT EXISTS idx_line_items_account_id ON line_items(account_id);

            -- Seed some default accounts
            INSERT INTO accounts (code, name, type, description)
            VALUES 
              ('1000', 'Petty Cash', 'ASSET', 'Physical cash on hand'),
              ('6001', 'Office Supplies', 'EXPENSE', 'Stationery, paper, etc.'),
              ('6002', 'Travel & Transport', 'EXPENSE', 'Local and long distance travel'),
              ('6003', 'Meals & Entertainment', 'EXPENSE', 'Business meals and events'),
              ('6004', 'Communication', 'EXPENSE', 'Mobile data, airtime, internet'),
              ('6005', 'Maintenance & Repairs', 'EXPENSE', 'Building and equipment maintenance')
            ON CONFLICT (code) DO NOTHING;
        `;

        await client.query(query);
        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();

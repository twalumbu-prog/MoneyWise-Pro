import dotenv from 'dotenv';
import path from 'path';

// Explicitly load .env from the current directory
const envPath = path.resolve(__dirname, '../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('[API] Error loading .env:', result.error);
} else {
    console.log('[API] .env loaded successfully');
    console.log('[API] QB_CLIENT_ID:', process.env.QB_CLIENT_ID ? 'FOUND' : 'MISSING');
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Pool } from 'pg';
import requisitionRoutes from './routes/requisition.routes';
import authRoutes from './routes/auth.routes';
import accountRoutes from './routes/account.routes';
import voucherRoutes from './routes/voucher.routes';
import cashbookRoutes from './routes/cashbook.routes';
import integrationRoutes from './routes/integrations.routes';
import userRoutes from './routes/user.routes';
import aiRoutes from './routes/ai.routes';
import organizationRoutes from './routes/organization.routes';

dotenv.config();

console.log('[API] Server starting up...');
// console.log('[API] NODE_ENV:', process.env.NODE_ENV); // Removed for security

import pool from './db';

const runMigration = async () => {
    const directUrl = process.env.DIRECT_DATABASE_URL;
    if (!directUrl) {
        console.warn('[Migration] DIRECT_DATABASE_URL not found, using default pool (may fail for DDL)');
    }

    const migrationPool = directUrl
        ? new Pool({ connectionString: directUrl, ssl: { rejectUnauthorized: false } })
        : pool;

    try {
        console.log('[Migration] Starting startup migration...');

        // ... existing migrations ...
        await migrationPool.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS category TEXT;');

        await migrationPool.query(`
            ALTER TABLE organizations
            ADD COLUMN IF NOT EXISTS email VARCHAR(255),
            ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
            ADD COLUMN IF NOT EXISTS address TEXT,
            ADD COLUMN IF NOT EXISTS tax_id VARCHAR(100),
            ADD COLUMN IF NOT EXISTS website VARCHAR(255);
        `);

        await migrationPool.query(`
            ALTER TABLE disbursements 
            ADD COLUMN IF NOT EXISTS returned_denominations JSONB,
            ADD COLUMN IF NOT EXISTS actual_change_amount NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS confirmed_denominations JSONB,
            ADD COLUMN IF NOT EXISTS confirmed_change_amount NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id),
            ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS discrepancy_amount NUMERIC DEFAULT 0;
        `);

        await migrationPool.query(`
            ALTER TABLE cashbook_entries 
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED';

            ALTER TABLE cashbook_entries
            DROP CONSTRAINT IF EXISTS cashbook_entries_entry_type_check;

            ALTER TABLE cashbook_entries
            ADD CONSTRAINT cashbook_entries_entry_type_check 
            CHECK (entry_type IN ('DISBURSEMENT', 'RETURN', 'ADJUSTMENT', 'OPENING_BALANCE', 'CLOSING_BALANCE', 'INFLOW'));
        `);

        console.log('[Migration] Checking for QuickBooks integration table and columns...');
        await migrationPool.query(`
            CREATE TABLE IF NOT EXISTS public.integrations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                provider VARCHAR(50) NOT NULL UNIQUE,
                access_token TEXT,
                refresh_token TEXT,
                token_expires_at TIMESTAMP WITH TIME ZONE,
                refresh_token_expires_at TIMESTAMP WITH TIME ZONE,
                realm_id VARCHAR(100),
                config JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            ALTER TABLE requisitions 
            ADD COLUMN IF NOT EXISTS qb_expense_id VARCHAR(100),
            ADD COLUMN IF NOT EXISTS qb_sync_status VARCHAR(20) DEFAULT 'PENDING',
            ADD COLUMN IF NOT EXISTS qb_sync_error TEXT,
            ADD COLUMN IF NOT EXISTS qb_sync_at TIMESTAMP WITH TIME ZONE;

            ALTER TABLE accounts
            ADD COLUMN IF NOT EXISTS qb_account_id VARCHAR(100);
        `);

        console.log('[Migration] Checking for "sync_logs" table...');
        await migrationPool.query(`
            CREATE TABLE IF NOT EXISTS public.sync_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                requisition_id UUID REFERENCES public.requisitions(id),
                qb_expense_id VARCHAR(100),
                synced_by UUID REFERENCES public.users(id),
                status VARCHAR(50) NOT NULL,
                details JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        console.log('[Migration] Checking for "vouchers" table...');
        await migrationPool.query(`
            CREATE TABLE IF NOT EXISTS public.vouchers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                requisition_id UUID REFERENCES requisitions(id),
                created_by UUID REFERENCES users(id),
                posted_by UUID REFERENCES users(id),
                reference_number VARCHAR(50) UNIQUE,
                date DATE,
                amount DECIMAL(10, 2) DEFAULT 0,
                description TEXT,
                total_debit DECIMAL(10, 2) DEFAULT 0,
                total_credit DECIMAL(10, 2) DEFAULT 0,
                status VARCHAR(50) DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'POSTED_TO_QB')),
                payment_account_id VARCHAR(255),
                payment_account_name TEXT,
                posted_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            ALTER TABLE public.vouchers
            ADD COLUMN IF NOT EXISTS posted_by UUID REFERENCES public.users(id),
            ADD COLUMN IF NOT EXISTS payment_account_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS payment_account_name TEXT;

            ALTER TABLE cashbook_entries 
            ADD COLUMN IF NOT EXISTS voucher_id UUID REFERENCES vouchers(id);
        `);
        console.log('[Migration] Schema update successful.');

        // Add QB classification columns to line_items
        console.log('[Migration] Checking for QB classification columns on line_items...');
        await migrationPool.query(`
            ALTER TABLE public.line_items
            ADD COLUMN IF NOT EXISTS qb_account_id VARCHAR(100),
            ADD COLUMN IF NOT EXISTS qb_account_name TEXT;
        `);
        console.log('[Migration] line_items QB columns ready.');

        // Update vouchers status check constraint
        console.log('[Migration] Updating vouchers status constraint...');
        await migrationPool.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_status_check') THEN
                    ALTER TABLE public.vouchers DROP CONSTRAINT vouchers_status_check;
                END IF;
                ALTER TABLE public.vouchers ADD CONSTRAINT vouchers_status_check CHECK (status IN ('DRAFT', 'POSTED', 'POSTED_TO_QB'));
            END $$;
        `);
        console.log('[Migration] vouchers status constraint updated.');

        // Refresh PostgREST schema cache
        console.log('[Migration] Reloading PostgREST schema cache...');
        await migrationPool.query("NOTIFY pgrst, 'reload config';");

    } catch (err) {
        console.error('[Migration] Failed to run startup migration:', err);
    } finally {
        if (directUrl && migrationPool instanceof Pool) {
            await (migrationPool as Pool).end();
        }
    }
};

// Run migrations on startup
runMigration().catch(err => {
    console.error('[Migration] Critical failure during startup:', err);
});

const app = express();
const port = process.env.PORT || 3000;

// Security Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/requisitions', requisitionRoutes);
app.use('/accounts', accountRoutes);
app.use('/vouchers', voucherRoutes);
app.use('/cashbook', cashbookRoutes);
app.use('/integrations', integrationRoutes);
app.use('/users', userRoutes);
app.use('/ai', aiRoutes);

app.get('/', (req: any, res: any) => {
    res.send('Money Wise Pro API is running securely');
});

// For local development
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

// Export for Vercel
export default app;

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import requisitionRoutes from './routes/requisition.routes';
import authRoutes from './routes/auth.routes';
import accountRoutes from './routes/account.routes';
import voucherRoutes from './routes/voucher.routes';
import cashbookRoutes from './routes/cashbook.routes';
import integrationRoutes from './routes/integrations.routes';

dotenv.config();

console.log('[API] Server starting up...');
console.log('[API] NODE_ENV:', process.env.NODE_ENV);
console.log('[API] PORT:', process.env.PORT);

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
        console.log('[Migration] Starting startup migration using ' + (directUrl ? 'direct connection' : 'default pool') + '...');

        console.log('[Migration] Checking for "category" column in "accounts" table...');
        await migrationPool.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS category TEXT;');

        console.log('[Migration] Checking for change return columns in "disbursements" table...');
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

        console.log('[Migration] Checking for status column in "cashbook_entries" table...');
        await migrationPool.query(`
            ALTER TABLE cashbook_entries 
            ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED';
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

        console.log('[Migration] Schema update successful.');

        // Refresh PostgREST schema cache
        console.log('[Migration] Reloading PostgREST schema cache...');
        await migrationPool.query("NOTIFY pgrst, 'reload config';");

    } catch (err) {
        console.error('[Migration] Failed to run startup migration:', err);
    } finally {
        if (directUrl && migrationPool instanceof Pool) {
            await (migrationPool as Pool).end();
            console.log('[Migration] Direct connection pool closed.');
        }
    }
};

// Run migrations on startup - only in non-production or if explicitly requested
if (process.env.NODE_ENV !== 'production' || process.env.RUN_MIGRATIONS === 'true') {
    runMigration().catch(err => {
        console.error('[Migration] Critical failure during startup:', err);
    });
} else {
    console.log('[Migration] Skipping auto-migration in production mode.');
}

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/requisitions', requisitionRoutes);
app.use('/accounts', accountRoutes);
app.use('/vouchers', voucherRoutes);
app.use('/cashbook', cashbookRoutes);
app.use('/integrations', integrationRoutes);

app.get('/', (req: any, res: any) => {
    res.send('AE&CF API is running');
});

// For local development
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

// Export for Vercel
export default app;

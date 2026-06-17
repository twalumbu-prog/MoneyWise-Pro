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
import budgetRoutes from './routes/budget.routes';
import reportRoutes from './routes/report.routes';
import lencoRoutes from './routes/lenco.routes';
import productRoutes from './routes/product.routes';
import paymentLinkRoutes from './routes/payment_link.routes';
import departmentRoutes from './routes/department.routes';

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
        ? new Pool({ 
            connectionString: directUrl, 
            ssl: directUrl.includes('supabase.co') || directUrl.includes('.db.elephantsql.com')
                ? { rejectUnauthorized: false }
                : false
          })
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
            ADD COLUMN IF NOT EXISTS website VARCHAR(255),
            ADD COLUMN IF NOT EXISTS lenco_subaccount_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS payment_test_mode BOOLEAN DEFAULT FALSE;
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
            ADD COLUMN IF NOT EXISTS external_reference TEXT;

            CREATE UNIQUE INDEX IF NOT EXISTS uniq_cashbook_inflow_per_reference
              ON cashbook_entries (external_reference)
              WHERE entry_type = 'INFLOW' AND external_reference IS NOT NULL;

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
            ADD COLUMN IF NOT EXISTS voucher_id UUID REFERENCES vouchers(id),
            ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id),
            ADD COLUMN IF NOT EXISTS qb_sync_status VARCHAR(20) DEFAULT 'PENDING',
            ADD COLUMN IF NOT EXISTS qb_sync_error TEXT,
            ADD COLUMN IF NOT EXISTS qb_sync_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS qb_expense_id VARCHAR(100),
            ADD COLUMN IF NOT EXISTS qb_deposit_id VARCHAR(100);
        `);
        
        console.log('[Migration] Checking for "budgets" table...');
        await migrationPool.query(`
            CREATE TABLE IF NOT EXISTS public.budgets (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                organization_id UUID NOT NULL REFERENCES public.organizations(id),
                qb_account_id VARCHAR(100) NOT NULL,
                qb_account_name TEXT NOT NULL,
                amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
                period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY')),
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                created_by UUID REFERENCES public.users(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(organization_id, qb_account_id, period_type, start_date)
            );
        `);
        // Add payment_info column to users for storing bank/mobile money account details
        console.log('[Migration] Checking for payment_info column on users...');
        await migrationPool.query(`
            ALTER TABLE public.users
            ADD COLUMN IF NOT EXISTS payment_info JSONB DEFAULT NULL;
        `);
        console.log('[Migration] payment_info column ready.');

        console.log('[Migration] Schema update successful.');

        // Add QB classification columns to line_items
        console.log('[Migration] Checking for QB classification columns on line_items...');
        await migrationPool.query(`
            ALTER TABLE public.line_items
            ADD COLUMN IF NOT EXISTS qb_account_id VARCHAR(100),
            ADD COLUMN IF NOT EXISTS qb_account_name TEXT,
            ADD COLUMN IF NOT EXISTS ai_extracted_amount NUMERIC;
        `);
        console.log('[Migration] line_items QB columns ready.');

        // Add logo and products tables
        console.log('[Migration] Setting up organization logo and products database structures...');
        await migrationPool.query(`
            ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;

            CREATE TABLE IF NOT EXISTS public.products (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                price NUMERIC(15, 2) NOT NULL DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

            DROP POLICY IF EXISTS "Manage products of own organization" ON public.products;
            CREATE POLICY "Manage products of own organization" ON public.products
                FOR ALL TO authenticated USING (true) WITH CHECK (true);

            CREATE TABLE IF NOT EXISTS public.product_sales (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
                product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
                customer_name TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                amount_paid NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
                reference VARCHAR(255) NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            ALTER TABLE public.product_sales ENABLE ROW LEVEL SECURITY;

            DROP POLICY IF EXISTS "Manage product sales of own organization" ON public.product_sales;
            CREATE POLICY "Manage product sales of own organization" ON public.product_sales
                FOR ALL TO authenticated USING (true) WITH CHECK (true);

            INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
            VALUES ('organization-logos', 'organization-logos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
            ON CONFLICT (id) DO NOTHING;

            DROP POLICY IF EXISTS "Allow public read from organization-logos" ON storage.objects;
            CREATE POLICY "Allow public read from organization-logos" ON storage.objects
                FOR SELECT TO public USING (bucket_id = 'organization-logos');

            DROP POLICY IF EXISTS "Allow authenticated uploads to organization-logos" ON storage.objects;
            CREATE POLICY "Allow authenticated uploads to organization-logos" ON storage.objects
                FOR INSERT TO authenticated WITH CHECK (bucket_id = 'organization-logos');

            DROP POLICY IF EXISTS "Allow authenticated management of organization-logos" ON storage.objects;
            CREATE POLICY "Allow authenticated management of organization-logos" ON storage.objects
                FOR ALL TO authenticated USING (bucket_id = 'organization-logos') WITH CHECK (bucket_id = 'organization-logos');
        `);
        console.log('[Migration] Logo and products DB structures ready.');

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
        // Disable RLS on user_organizations table so that API server is not blocked
        console.log('[Migration] Disabling RLS on user_organizations table...');
        try {
            await migrationPool.query('ALTER TABLE IF EXISTS public.user_organizations DISABLE ROW LEVEL SECURITY;');
            console.log('[Migration] Disabled RLS on user_organizations successfully.');
        } catch (rlsError: any) {
            console.warn('[Migration] Failed to disable RLS on user_organizations (non-fatal):', rlsError.message);
        }

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

// Run migrations on startup (Non-fatal for local dev)
runMigration().catch(err => {
    console.error('[Migration] Critical failure during startup (continuing anyway):', err);
});

const app = express();
const port = process.env.PORT || 3000;

// Security Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({
    verify: (req: any, res, buf) => {
        req.rawBody = buf;
    }
}));

// Routes
app.use('/auth', authRoutes);
app.use('/requisitions', requisitionRoutes);
app.use('/accounts', accountRoutes);
app.use('/vouchers', voucherRoutes);
app.use('/cashbook', cashbookRoutes);
app.use('/integrations', integrationRoutes);
app.use('/users', userRoutes);
app.use('/ai', aiRoutes);
app.use('/organizations', organizationRoutes);
app.use('/organizations/products', productRoutes);
app.use('/organizations/payment-links', paymentLinkRoutes);
app.use('/departments', departmentRoutes);
app.use('/budgets', budgetRoutes);
app.use('/reports', reportRoutes);
app.use('/lenco', lencoRoutes);

// Log routes for debugging
console.log('--- REGISTERED ROUTES ---');
const routes: any[] = [];
app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
        routes.push({ path: middleware.route.path, methods: Object.keys(middleware.route.methods) });
    } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach((handler: any) => {
            if (handler.route) {
                const path = middleware.regexp.toString().replace('/^\\', '').replace('\\/?(?=\\/|$)/i', '') + handler.route.path;
                routes.push({ path, methods: Object.keys(handler.route.methods) });
            }
        });
    }
});
console.log(JSON.stringify(routes, null, 2));

app.get('/', (req: any, res: any) => {
    res.send('Money Wise Pro API is running securely');
});

// For local development hot reloading
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

// Export for Vercel
export default app;

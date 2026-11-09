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
import rewardsRoutes from './routes/rewards.routes';
import payLinkRoutes from './routes/payLink.routes';
import aiRoutes from './routes/ai.routes';
import organizationRoutes from './routes/organization.routes';
import budgetRoutes from './routes/budget.routes';
import reportRoutes from './routes/report.routes';
import journalRoutes from './routes/journal.routes';
import lencoRoutes from './routes/lenco.routes';
import lipilaRoutes from './routes/lipila.routes';
import productRoutes from './routes/product.routes';
import paymentLinkRoutes from './routes/payment_link.routes';
import departmentRoutes from './routes/department.routes';
import adminRoutes from './routes/admin.routes';
import onboardingRoutes from './routes/onboarding.routes';
import webhooksRoutes from './routes/webhooks.routes';
import accountingRoutes from './routes/accountingStatements.routes';
import purchasingRoutes from './routes/purchasing.routes';
import { handleCallback as handleFaceMatchCallback } from './services/faceMatch.service';
import payrollRoutes from './routes/payroll.routes';
import crmRoutes from './routes/crm.routes';
import invoiceRoutes from './routes/invoice.routes';
import scheduleRoutes from './routes/schedule.routes';
import automationRoutes from './routes/automation.routes';
import billingRoutes from './routes/billing.routes';
import cronRoutes from './routes/cron.routes';
import { startImportRefresh } from './services/imports.service';
import { startFundFeeds } from './services/fundFeeds.service';
import { cronHeartbeat } from './middleware/cronHeartbeat';
import investRoutes from './routes/invest.routes';
import savingsRoutes from './routes/savings.routes';
import developerRoutes from './routes/developer.routes';
import publicApiRoutes from './routes/publicApi.routes';
import oauthRoutes from './routes/oauth.routes';
import momoCaptureRoutes from './routes/momoCapture.routes';
import marketplaceRoutes from './routes/marketplace.routes';
import loansRoutes from './routes/loans.routes';
import { broadcastAfterWrite } from './lib/realtimeBroadcast';

dotenv.config();

console.log('[API] Server starting up...');
// console.log('[API] NODE_ENV:', process.env.NODE_ENV); // Removed for security

import pool from './db';

// Bumped whenever a statement is added below. Cold starts check this against the
// DB-persisted marker first and skip the full DDL replay if already applied —
// each cold Vercel instance otherwise opened a fresh direct connection and reran
// ~15 sequential DDL statements just to find out they were all no-ops, which is
// what was exhausting Postgres's connection limit under concurrent traffic.
const MIGRATION_VERSION = 33;

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
                : false,
            max: 2,
            idleTimeoutMillis: 5000,
            connectionTimeoutMillis: 5000,
          })
        : pool;

    try {
        await migrationPool.query(`
            CREATE TABLE IF NOT EXISTS public.schema_migrations (
                id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                version INT NOT NULL DEFAULT 0
            );
            INSERT INTO public.schema_migrations (id, version) VALUES (1, 0)
            ON CONFLICT (id) DO NOTHING;
        `);
        const { rows } = await migrationPool.query('SELECT version FROM public.schema_migrations WHERE id = 1;');
        const appliedVersion = rows[0]?.version ?? 0;
        if (appliedVersion >= MIGRATION_VERSION) {
            console.log(`[Migration] Already at version ${appliedVersion}, skipping DDL replay.`);
            return;
        }

        console.log(`[Migration] Applying migrations (${appliedVersion} -> ${MIGRATION_VERSION})...`);

        // ... existing migrations ...
        await migrationPool.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS category TEXT;');

        await migrationPool.query(`
            CREATE TABLE IF NOT EXISTS public.customers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                notes TEXT,
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

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
        // Bank / mobile-money details are per company (the membership), not per person.
        await migrationPool.query(`
            ALTER TABLE public.user_organizations
            ADD COLUMN IF NOT EXISTS payment_info JSONB DEFAULT NULL;
            UPDATE public.user_organizations uo SET payment_info = u.payment_info
            FROM public.users u
            WHERE u.id = uo.user_id AND uo.organization_id = u.organization_id
              AND uo.payment_info IS NULL AND u.payment_info IS NOT NULL;
        `);

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

        // Personal-vs-business was inferred at runtime from a substring match on
        // the org's own display name ("workspace"/"personal"/"individual"/
        // "private") — unsafe since the name is user-supplied and "Private" is a
        // standard Zambian company suffix ("X (Private) Limited"), so an ordinary
        // registered business could be misclassified. This gives it a real column
        // instead. "private" is deliberately excluded from the backfill match for
        // that same reason — only ensurePersonalWorkspace's own naming pattern
        // ("<name>'s Personal Account") is trusted to identify existing ones.
        console.log('[Migration] Adding organizations.is_personal...');
        await migrationPool.query(`
            ALTER TABLE organizations
            ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT FALSE;

            UPDATE organizations
            SET is_personal = TRUE
            WHERE is_personal = FALSE
              AND (
                  lower(name) LIKE '%workspace%'
                  OR lower(name) LIKE '%personal account%'
                  OR lower(name) LIKE '%individual%'
              );
        `);

        // Investor accounts (see supabase/migrations/20261005120000_investor_accounts.sql —
        // keep the two in step; this is what actually runs against production).
        console.log('[Migration] Adding investor accounts...');
        await migrationPool.query(`
            ALTER TABLE public.investment_targets
                ADD COLUMN IF NOT EXISTS provider_key TEXT,
                ADD COLUMN IF NOT EXISTS requires_account BOOLEAN NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS sales_people JSONB NOT NULL DEFAULT '[]'::jsonb,
                ADD COLUMN IF NOT EXISTS fund_fact_sheet_url TEXT;
            CREATE UNIQUE INDEX IF NOT EXISTS uq_investment_targets_provider_key
                ON public.investment_targets (provider_key) WHERE provider_key IS NOT NULL;

            ALTER TABLE public.organizations
                ADD COLUMN IF NOT EXISTS payout_bank_code TEXT,
                ADD COLUMN IF NOT EXISTS payout_bank_name TEXT,
                ADD COLUMN IF NOT EXISTS payout_branch TEXT,
                ADD COLUMN IF NOT EXISTS payout_account_number TEXT,
                ADD COLUMN IF NOT EXISTS payout_account_name TEXT,
                ADD COLUMN IF NOT EXISTS forward_investor_deposits BOOLEAN NOT NULL DEFAULT FALSE;

            CREATE TABLE IF NOT EXISTS public.investor_accounts (
                id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                investor_organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
                investment_target_id     UUID NOT NULL REFERENCES public.investment_targets(id) ON DELETE CASCADE,
                target_organization_id   UUID NOT NULL,
                user_id                  UUID NOT NULL,
                source                   TEXT NOT NULL CHECK (source IN ('REGISTERED', 'CONNECTED')),
                status                   TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
                    CHECK (status IN ('PENDING_REVIEW', 'INFO_REQUESTED', 'ACTIVE', 'REJECTED', 'SUSPENDED')),
                account_number           TEXT,
                applicant                JSONB,
                documents                JSONB,
                declaration_accepted_at  TIMESTAMPTZ,
                pdf_path                 TEXT,
                email_sent_at            TIMESTAMPTZ,
                email_error              TEXT,
                review_note              TEXT,
                reviewed_by              UUID,
                reviewed_at              TIMESTAMPTZ,
                created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_investor_accounts_live
                ON public.investor_accounts (investor_organization_id, investment_target_id)
                WHERE status <> 'REJECTED';
            CREATE UNIQUE INDEX IF NOT EXISTS uq_investor_accounts_number
                ON public.investor_accounts (investment_target_id, lower(account_number))
                WHERE account_number IS NOT NULL AND status = 'ACTIVE';
            CREATE INDEX IF NOT EXISTS idx_investor_accounts_target
                ON public.investor_accounts (target_organization_id, status, created_at DESC);
            ALTER TABLE public.investor_accounts ENABLE ROW LEVEL SECURITY;

            ALTER TABLE public.investments
                ADD COLUMN IF NOT EXISTS investor_account_id UUID REFERENCES public.investor_accounts(id),
                ADD COLUMN IF NOT EXISTS investor_account_number TEXT,
                ADD COLUMN IF NOT EXISTS product_name TEXT;
        `);
        // Loan / salary-advance recoveries acknowledged by an admin outside payroll.
        await migrationPool.query(`
            CREATE TABLE IF NOT EXISTS public.loan_manual_recoveries (
                id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                organization_id uuid NOT NULL,
                requisition_id  uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
                amount          numeric NOT NULL CHECK (amount > 0),
                note            text,
                recorded_by     uuid,
                created_at      timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_lmr_requisition ON public.loan_manual_recoveries(requisition_id);
            CREATE INDEX IF NOT EXISTS idx_lmr_organization ON public.loan_manual_recoveries(organization_id);
            ALTER TABLE public.loan_manual_recoveries ENABLE ROW LEVEL SECURITY;
        `);

        // Customer rewards (Menu → Rewards): programmes, points ledger, vouchers, invite codes.
        await migrationPool.query(`
            CREATE TABLE IF NOT EXISTS public.reward_programs (
                organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                points_per_kwacha NUMERIC(10,4) NOT NULL DEFAULT 1,
                reward_threshold INT NOT NULL DEFAULT 500,
                reward_title TEXT NOT NULL DEFAULT 'K25 off your next purchase',
                reward_value NUMERIC(14,2) NOT NULL DEFAULT 25,
                referral_points INT NOT NULL DEFAULT 100,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS public.reward_ledger (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL,
                organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
                points INT NOT NULL,
                kind TEXT NOT NULL CHECK (kind IN ('PURCHASE', 'REFERRAL', 'BONUS', 'REDEMPTION')),
                description TEXT,
                ref TEXT NOT NULL,
                amount NUMERIC(14,2),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_reward_ledger_user_ref ON public.reward_ledger(user_id, ref);
            CREATE INDEX IF NOT EXISTS idx_reward_ledger_user_org ON public.reward_ledger(user_id, organization_id, created_at DESC);
            CREATE TABLE IF NOT EXISTS public.reward_redemptions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL,
                organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
                points INT NOT NULL,
                title TEXT NOT NULL,
                value NUMERIC(14,2) NOT NULL DEFAULT 0,
                code TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'USED', 'CANCELLED')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                used_at TIMESTAMPTZ,
                used_by UUID
            );
            CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user ON public.reward_redemptions(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_reward_redemptions_org ON public.reward_redemptions(organization_id, status);
            CREATE TABLE IF NOT EXISTS public.reward_codes (
                user_id UUID PRIMARY KEY,
                code TEXT NOT NULL UNIQUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS public.reward_referrals (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                referrer_user_id UUID NOT NULL,
                referred_user_id UUID NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REWARDED')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                rewarded_at TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS idx_reward_referrals_referrer ON public.reward_referrals(referrer_user_id);
            ALTER TABLE public.quick_link_payments ADD COLUMN IF NOT EXISTS payer_phone TEXT;
            ALTER TABLE public.quick_link_payments ADD COLUMN IF NOT EXISTS referral_code TEXT;
            CREATE INDEX IF NOT EXISTS idx_quick_link_payments_payer_phone ON public.quick_link_payments(payer_phone);
            CREATE INDEX IF NOT EXISTS idx_quick_link_payments_referral ON public.quick_link_payments(referral_code) WHERE referral_code IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_payment_links_customer_phone ON public.payment_links(customer_phone);
            ALTER TABLE public.reward_programs ENABLE ROW LEVEL SECURITY;
            ALTER TABLE public.reward_ledger ENABLE ROW LEVEL SECURITY;
            ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;
            ALTER TABLE public.reward_codes ENABLE ROW LEVEL SECURITY;
            ALTER TABLE public.reward_referrals ENABLE ROW LEVEL SECURITY;
        `);

        // What an investment is worth now (Home → Investments slide): the latest recorded value per company.
        await migrationPool.query(`
            CREATE TABLE IF NOT EXISTS public.investment_valuations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                investor_organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
                investment_target_id UUID NOT NULL REFERENCES public.investment_targets(id) ON DELETE CASCADE,
                value NUMERIC(16,2) NOT NULL CHECK (value >= 0),
                recorded_by UUID,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_investment_valuations_lookup ON public.investment_valuations(investor_organization_id, investment_target_id, created_at DESC);
            ALTER TABLE public.investment_valuations ENABLE ROW LEVEL SECURITY;
        `);

        // Per-person preferences (Settings → Preferences, personal app).
        await migrationPool.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;`);
        // Reusable KYC profile (Settings → KYC profile): one row per person, reused for every investment company.
        await migrationPool.query(`
            CREATE TABLE IF NOT EXISTS public.investor_kyc_profiles (
                user_id    UUID PRIMARY KEY,
                applicant  JSONB NOT NULL DEFAULT '{}'::jsonb,
                id_type    TEXT,
                documents  JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            ALTER TABLE public.investor_kyc_profiles ENABLE ROW LEVEL SECURITY;
        `);
        // The bucket + storage policy need rights on the storage schema; if the
        // migration role lacks them this logs and the SQL file must be run in the
        // Supabase SQL editor instead. It must not block the rest of the migration.
        try {
            await migrationPool.query(`
                INSERT INTO storage.buckets (id, name, public)
                VALUES ('investor-kyc', 'investor-kyc', FALSE)
                ON CONFLICT (id) DO NOTHING;
                DROP POLICY IF EXISTS "investor-kyc upload own folder" ON storage.objects;
                CREATE POLICY "investor-kyc upload own folder" ON storage.objects
                    FOR INSERT TO authenticated
                    WITH CHECK (bucket_id = 'investor-kyc' AND (storage.foldername(name))[1] = auth.uid()::text);
            `);
        } catch (storageErr: any) {
            console.warn('[Migration] investor-kyc bucket/policy not applied — run the storage section of 20261005120000_investor_accounts.sql in the Supabase SQL editor:', storageErr.message);
        }

        // Marketplace opt-in: a seller lists individual products. Off by default.
        await migrationPool.query(`
            ALTER TABLE public.products ADD COLUMN IF NOT EXISTS marketplace_listed BOOLEAN NOT NULL DEFAULT FALSE;
            CREATE INDEX IF NOT EXISTS idx_products_marketplace_listed
                ON public.products (marketplace_listed, created_at DESC)
                WHERE marketplace_listed = TRUE AND is_active = TRUE;
            -- New products are listed by default (existing rows are untouched).
            ALTER TABLE public.products ALTER COLUMN marketplace_listed SET DEFAULT TRUE;
        `);

        // Marketplace auctions, bids and seller reviews (see supabase/migrations/20261102150000_marketplace_auctions_reviews.sql).
        await migrationPool.query(`

CREATE TABLE IF NOT EXISTS public.marketplace_auctions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id         UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    start_price        NUMERIC(14,2) NOT NULL CHECK (start_price >= 0),
    reserve_price      NUMERIC(14,2) CHECK (reserve_price IS NULL OR reserve_price >= 0),
    buy_now_price      NUMERIC(14,2) CHECK (buy_now_price IS NULL OR buy_now_price > 0),
    bid_increment      NUMERIC(14,2) NOT NULL DEFAULT 1 CHECK (bid_increment > 0),
    starts_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at            TIMESTAMPTZ NOT NULL,
    status             TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SOLD', 'NO_SALE', 'CANCELLED')),
    winner_user_id     UUID,
    winner_org_id      UUID,
    winner_name        TEXT,
    winner_phone       TEXT,
    winning_amount     NUMERIC(14,2),
    payment_link_token TEXT,
    settled_at         TIMESTAMPTZ,
    created_by         UUID,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_auction_open_product ON public.marketplace_auctions (product_id) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_marketplace_auctions_due ON public.marketplace_auctions (status, ends_at);

CREATE TABLE IF NOT EXISTS public.marketplace_bids (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_id       UUID NOT NULL REFERENCES public.marketplace_auctions(id) ON DELETE CASCADE,
    bidder_user_id   UUID NOT NULL,
    bidder_org_id    UUID,
    bidder_name      TEXT NOT NULL,
    bidder_phone     TEXT,
    amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_auction ON public.marketplace_bids (auction_id, amount DESC, created_at);

CREATE TABLE IF NOT EXISTS public.marketplace_reviews (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_org_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    reviewer_user_id  UUID NOT NULL,
    reviewer_org_id   UUID,
    reviewer_name     TEXT NOT NULL,
    rating            SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment           TEXT,
    verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (seller_org_id, reviewer_user_id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_seller ON public.marketplace_reviews (seller_org_id, created_at DESC);

-- Only the API (service role) reads and writes these.
ALTER TABLE public.marketplace_auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_reviews ENABLE ROW LEVEL SECURITY;

-- Places a bid atomically. Raises BID_CLOSED, OWN_AUCTION or BID_TOO_LOW:<minimum> instead of inserting when the bid isn't allowed.
CREATE OR REPLACE FUNCTION public.place_marketplace_bid(
    p_auction UUID, p_user UUID, p_org UUID, p_name TEXT, p_phone TEXT, p_amount NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    a public.marketplace_auctions%ROWTYPE;
    current_high NUMERIC;
    minimum NUMERIC;
    new_end TIMESTAMPTZ;
BEGIN
    SELECT * INTO a FROM public.marketplace_auctions WHERE id = p_auction FOR UPDATE;
    IF NOT FOUND OR a.status <> 'OPEN' OR a.ends_at <= now() THEN
        RAISE EXCEPTION 'BID_CLOSED';
    END IF;
    IF p_org IS NOT NULL AND p_org = a.organization_id THEN
        RAISE EXCEPTION 'OWN_AUCTION';
    END IF;

    SELECT max(amount) INTO current_high FROM public.marketplace_bids WHERE auction_id = p_auction;
    minimum := CASE WHEN current_high IS NULL THEN a.start_price ELSE current_high + a.bid_increment END;
    IF p_amount < minimum THEN
        RAISE EXCEPTION 'BID_TOO_LOW:%', minimum;
    END IF;

    INSERT INTO public.marketplace_bids (auction_id, bidder_user_id, bidder_org_id, bidder_name, bidder_phone, amount)
    VALUES (p_auction, p_user, p_org, p_name, p_phone, p_amount);

    -- A bid in the last two minutes extends the auction by two minutes, so nobody wins by out-waiting the clock.
    new_end := a.ends_at;
    IF a.ends_at - now() < interval '2 minutes' THEN
        new_end := now() + interval '2 minutes';
        UPDATE public.marketplace_auctions SET ends_at = new_end WHERE id = p_auction;
    END IF;

    RETURN jsonb_build_object('amount', p_amount, 'endsAt', new_end);
END;
$$;

        `);

        // Marketplace orders and auction non-payment strikes (see supabase/migrations/20261102170000_marketplace_orders.sql).
        await migrationPool.query(`

CREATE TABLE IF NOT EXISTS public.marketplace_orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name        TEXT NOT NULL,
    seller_org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    buyer_user_id       UUID NOT NULL,
    buyer_org_id        UUID,
    buyer_name          TEXT NOT NULL,
    buyer_phone         TEXT,
    auction_id          UUID REFERENCES public.marketplace_auctions(id) ON DELETE SET NULL,
    quantity            INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price          NUMERIC(14,2) NOT NULL,
    item_total          NUMERIC(14,2) NOT NULL,
    delivery_method     TEXT NOT NULL DEFAULT 'PICKUP' CHECK (delivery_method IN ('PICKUP', 'SELLER', 'OPUS')),
    delivery_fee        NUMERIC(14,2) NOT NULL DEFAULT 0,
    delivery_area       TEXT,
    delivery_address    TEXT,
    delivery_notes      TEXT,
    total               NUMERIC(14,2) NOT NULL,
    payment_method      TEXT NOT NULL DEFAULT 'MONEYWISE_PAY',
    status              TEXT NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (status IN
                          ('PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'DISPUTED', 'FAILED')),
    requisition_id      UUID,
    payment_reference   TEXT,
    idempotency_key     TEXT UNIQUE,
    dispute_reason      TEXT,
    dispute_opened_at   TIMESTAMPTZ,
    dispute_response    TEXT,
    dispute_resolved_at TIMESTAMPTZ,
    status_before_dispute TEXT,
    paid_at             TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_buyer ON public.marketplace_orders (buyer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_seller ON public.marketplace_orders (seller_org_id, created_at DESC);
-- A won auction can be paid once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_orders_auction_paid ON public.marketplace_orders (auction_id)
    WHERE auction_id IS NOT NULL AND status NOT IN ('FAILED', 'PENDING_PAYMENT');

ALTER TABLE public.marketplace_auctions ADD COLUMN IF NOT EXISTS unpaid_at TIMESTAMPTZ;
ALTER TABLE public.marketplace_auctions ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.marketplace_strikes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    auction_id  UUID REFERENCES public.marketplace_auctions(id) ON DELETE SET NULL,
    reason      TEXT NOT NULL DEFAULT 'AUCTION_NOT_PAID',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, auction_id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_strikes_user ON public.marketplace_strikes (user_id);

ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_strikes ENABLE ROW LEVEL SECURITY;

-- Refunds on Marketplace orders (see supabase/migrations/20261102180000_marketplace_refunds.sql).
ALTER TABLE public.marketplace_orders DROP CONSTRAINT IF EXISTS marketplace_orders_status_check;
ALTER TABLE public.marketplace_orders ADD CONSTRAINT marketplace_orders_status_check CHECK (status IN
    ('PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'DISPUTED', 'FAILED', 'REFUNDED'));
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS refund_started_at TIMESTAMPTZ;
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(14,2);
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS refund_reference TEXT;

-- Pay in 4 (see supabase/migrations/20261102190000_pay_later.sql).
CREATE TABLE IF NOT EXISTS public.pay_later_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
    buyer_user_id UUID NOT NULL, buyer_org_id UUID NOT NULL, seller_org_id UUID NOT NULL,
    description TEXT NOT NULL, principal NUMERIC(14,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'DEFAULTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ, defaulted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pay_later_plans_buyer ON public.pay_later_plans (buyer_user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.pay_later_instalments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.pay_later_plans(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL CHECK (seq BETWEEN 1 AND 4), amount NUMERIC(14,2) NOT NULL, due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'LATE')),
    late_fee NUMERIC(14,2) NOT NULL DEFAULT 0, paid_at TIMESTAMPTZ, payment_reference TEXT, reminder_sent_at TIMESTAMPTZ, processing_at TIMESTAMPTZ,
    UNIQUE (plan_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_pay_later_instalments_due ON public.pay_later_instalments (status, due_date);
ALTER TABLE public.pay_later_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_later_instalments ENABLE ROW LEVEL SECURITY;

-- Weight and size of a product for Opus Delivery pricing (see supabase/migrations/20261102200000_products_weight_size.sql).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(8,2) CHECK (weight_kg IS NULL OR weight_kg > 0);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS parcel_size TEXT CHECK (parcel_size IS NULL OR parcel_size IN ('SMALL', 'MEDIUM', 'LARGE', 'BULKY'));

-- A store's look on the Marketplace (see supabase/migrations/20261102210000_store_theme.sql).
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS store_theme JSONB;

-- Seller replies to reviews (see supabase/migrations/20261102220000_review_replies.sql).
ALTER TABLE public.marketplace_reviews ADD COLUMN IF NOT EXISTS seller_reply TEXT;
ALTER TABLE public.marketplace_reviews ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

-- MoneyWise Ads, phase 1 (see supabase/migrations/20261102230000_ad_campaigns.sql).
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('FEATURED_ITEM', 'BOOSTED_ITEM', 'FEATURED_STORE')),
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    days INTEGER NOT NULL CHECK (days BETWEEN 1 AND 60),
    start_date DATE NOT NULL, end_date DATE NOT NULL, price NUMERIC(14,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (status IN ('PENDING_PAYMENT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'FAILED')),
    idempotency_key TEXT UNIQUE, requisition_id UUID, payment_reference TEXT,
    reviewed_by TEXT, reviewed_at TIMESTAMPTZ, reject_reason TEXT, refunded_at TIMESTAMPTZ, refund_reference TEXT,
    impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_org ON public.ad_campaigns (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_live ON public.ad_campaigns (status, start_date, end_date);
CREATE OR REPLACE FUNCTION public.bump_ad(p_id UUID, p_kind TEXT) RETURNS VOID
LANGUAGE sql SET search_path = public AS $fn$
    UPDATE public.ad_campaigns
       SET impressions = impressions + CASE WHEN p_kind = 'impression' THEN 1 ELSE 0 END,
           clicks      = clicks      + CASE WHEN p_kind = 'click' THEN 1 ELSE 0 END
     WHERE id = p_id AND status = 'APPROVED';
$fn$;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

-- Stock for products (see supabase/migrations/20261103100000_product_stock.sql).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS variants JSONB NOT NULL DEFAULT '[]'::jsonb;
-- Which option was bought, and whether the order is holding stock (so a failed payment gives it back).
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS variant_id TEXT;
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS variant_label TEXT;
CREATE OR REPLACE FUNCTION public.reserve_stock(p_product UUID, p_variant TEXT, p_qty INTEGER) RETURNS BOOLEAN
LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
    p RECORD;
    idx INTEGER;
BEGIN
    SELECT track_stock, stock_quantity, variants INTO p FROM public.products WHERE id = p_product FOR UPDATE;
    IF NOT FOUND THEN RETURN FALSE; END IF;
    IF NOT p.track_stock THEN RETURN TRUE; END IF;
    IF jsonb_array_length(p.variants) > 0 THEN
        SELECT (ord - 1)::INT INTO idx FROM jsonb_array_elements(p.variants) WITH ORDINALITY AS t(v, ord) WHERE v->>'id' = p_variant;
        IF idx IS NULL THEN RETURN FALSE; END IF;
        IF COALESCE((p.variants->idx->>'stock')::INT, 0) < p_qty THEN RETURN FALSE; END IF;
        UPDATE public.products SET variants = jsonb_set(variants, ARRAY[idx::TEXT, 'stock'], to_jsonb(COALESCE((variants->idx->>'stock')::INT, 0) - p_qty)) WHERE id = p_product;
        RETURN TRUE;
    END IF;
    IF COALESCE(p.stock_quantity, 0) < p_qty THEN RETURN FALSE; END IF;
    UPDATE public.products SET stock_quantity = stock_quantity - p_qty WHERE id = p_product;
    RETURN TRUE;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.release_stock(p_product UUID, p_variant TEXT, p_qty INTEGER) RETURNS VOID
LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
    p RECORD;
    idx INTEGER;
BEGIN
    SELECT track_stock, stock_quantity, variants INTO p FROM public.products WHERE id = p_product FOR UPDATE;
    IF NOT FOUND OR NOT p.track_stock THEN RETURN; END IF;
    IF jsonb_array_length(p.variants) > 0 THEN
        SELECT (ord - 1)::INT INTO idx FROM jsonb_array_elements(p.variants) WITH ORDINALITY AS t(v, ord) WHERE v->>'id' = p_variant;
        IF idx IS NULL THEN RETURN; END IF;
        UPDATE public.products SET variants = jsonb_set(variants, ARRAY[idx::TEXT, 'stock'], to_jsonb(COALESCE((variants->idx->>'stock')::INT, 0) + p_qty)) WHERE id = p_product;
    ELSE
        UPDATE public.products SET stock_quantity = COALESCE(stock_quantity, 0) + p_qty WHERE id = p_product;
    END IF;
END;
$fn$;

-- Imported products: items from overseas stores (eBay, AliExpress and others) shown in the Marketplace with prices in kwacha, bought on the
-- customer's behalf by MoneyWise and tracked until they arrive. Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.imported_products (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source            TEXT NOT NULL DEFAULT 'MANUAL',          -- MANUAL, EBAY, ALIEXPRESS ...
    source_id         TEXT,                                    -- the item's id at the source (for refreshing it)
    source_url        TEXT,
    title             TEXT NOT NULL,
    description       TEXT,
    images            JSONB NOT NULL DEFAULT '[]'::jsonb,
    category          TEXT,
    origin            TEXT,                                    -- where it ships from: USA, China, South Africa ...
    price             NUMERIC(14, 2) NOT NULL CHECK (price >= 0),     -- one item, in currency
    currency          TEXT NOT NULL DEFAULT 'USD',
    shipping_price    NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (shipping_price >= 0),  -- international shipping per item, in currency (0 = worked out from weight)
    weight_kg         NUMERIC(8, 3),
    delivery_days_min INTEGER NOT NULL DEFAULT 14,
    delivery_days_max INTEGER NOT NULL DEFAULT 28,
    options           JSONB NOT NULL DEFAULT '[]'::jsonb,      -- [{ "name": "Colour", "values": ["Black", "White"] }]
    is_active         BOOLEAN NOT NULL DEFAULT true,           -- false when the source no longer has it
    listed            BOOLEAN NOT NULL DEFAULT true,           -- shown in browse; links pasted by customers stay unlisted until a team member lists them
    views             INTEGER NOT NULL DEFAULT 0,
    last_refreshed_at TIMESTAMPTZ,
    refresh_error     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_imported_products_source ON public.imported_products (source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_imported_products_browse ON public.imported_products (is_active, listed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imported_products_refresh ON public.imported_products (last_refreshed_at NULLS FIRST) WHERE source <> 'MANUAL';

-- Exchange rates, fees and the other numbers behind a price, editable by the team.
CREATE TABLE IF NOT EXISTS public.import_settings (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.import_settings (key, value) VALUES
    ('fx', '{"USD": 27, "EUR": 29, "GBP": 34, "ZAR": 1.5, "CNY": 3.7, "ZMW": 1}'::jsonb),
    ('pricing', '{"feePercent": 10, "minFee": 30, "dutyPercent": 15, "vatPercent": 16, "shippingPerKgUsd": 12}'::jsonb),
    ('feeds', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.import_orders (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id         UUID REFERENCES public.imported_products(id) ON DELETE SET NULL,
    buyer_user_id      UUID NOT NULL,
    buyer_org_id       UUID,
    buyer_name         TEXT NOT NULL,
    buyer_phone        TEXT,
    title              TEXT NOT NULL,
    image_url          TEXT,
    source             TEXT,
    source_url         TEXT,
    quantity           INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    option_note        TEXT,                                   -- colour, size and so on, as the buyer typed it
    unit_price         NUMERIC(14, 2),
    currency           TEXT,
    fx_rate            NUMERIC(12, 4),
    item_zmw           NUMERIC(14, 2) NOT NULL DEFAULT 0,
    shipping_zmw       NUMERIC(14, 2) NOT NULL DEFAULT 0,
    taxes_zmw          NUMERIC(14, 2) NOT NULL DEFAULT 0,
    fee_zmw            NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_zmw          NUMERIC(14, 2) NOT NULL,
    delivery_area      TEXT,
    delivery_address   TEXT,
    notes              TEXT,
    status             TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
                       CHECK (status IN ('PENDING_PAYMENT','PAYMENT_PROCESSING','PAID','ORDERED','SHIPPED','IN_TRANSIT','CUSTOMS','IN_LUSAKA','DELIVERED','CANCELLED','REFUNDED','FAILED')),
    supplier_order_ref TEXT,
    tracking_number    TEXT,
    carrier            TEXT,
    events             JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{ "at": "...", "status": "SHIPPED", "note": "..." }]
    payment_reference  TEXT,
    requisition_id     UUID,
    paid_at            TIMESTAMPTZ,
    refund_reference   TEXT,
    refunded_at        TIMESTAMPTZ,
    idempotency_key    TEXT UNIQUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_orders_buyer ON public.import_orders (buyer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_orders_status ON public.import_orders (status, created_at DESC);

-- Only the API (service role) reads and writes these.
ALTER TABLE public.imported_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_orders ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.imported_products, public.import_settings, public.import_orders TO service_role;


-- Real fund prices: each investment company (an investment_target) lists its funds and sends a price (NAV per unit) with a date.
-- Charts, the "last updated" line and what an investor's holding is worth all come from these rows, never from a formula.
-- Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.fund_products (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investment_target_id UUID NOT NULL REFERENCES public.investment_targets(id) ON DELETE CASCADE,
    key                  TEXT NOT NULL,                       -- short stable name, e.g. equity-fund
    name                 TEXT NOT NULL,                       -- what investors see; an investment's product_name matches this
    kind                 TEXT NOT NULL DEFAULT 'UNIT_TRUST' CHECK (kind IN ('UNIT_TRUST','MONEY_MARKET','BOND','FIXED_DEPOSIT','OTHER')),
    currency             TEXT NOT NULL DEFAULT 'ZMW',
    frequency            TEXT NOT NULL DEFAULT 'DAILY' CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY','QUARTERLY')),
    min_deposit          NUMERIC(14, 2),
    risk                 TEXT,
    description          TEXT,
    is_active            BOOLEAN NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (investment_target_id, key)
);

CREATE TABLE IF NOT EXISTS public.fund_prices (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_id    UUID NOT NULL REFERENCES public.fund_products(id) ON DELETE CASCADE,
    as_of      DATE NOT NULL,                                 -- the day the price is for
    nav        NUMERIC(18, 6) NOT NULL CHECK (nav > 0),        -- price of one unit
    source     TEXT NOT NULL DEFAULT 'MANAGER',               -- MANAGER (sent by the company), FACTSHEET or WEBSITE (read from a published page)
    note       TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (fund_id, as_of)
);
CREATE INDEX IF NOT EXISTS idx_fund_prices_fund_date ON public.fund_prices (fund_id, as_of DESC);

-- Only the API (service role) reads and writes these.
ALTER TABLE public.fund_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_prices ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.fund_products, public.fund_prices TO service_role;



-- The latest quality check of each document on a person's MoneyWise ID: a score out of 100, whether it is usable, and what to fix.
-- The loan application reads this to say which documents still need replacing. Keep in step with the inline migration in apps/api/src/index.ts.
CREATE TABLE IF NOT EXISTS public.kyc_document_checks (
    user_id    UUID NOT NULL,
    slot       TEXT NOT NULL,                      -- id_front, id_back, photo, proof_of_residence
    path       TEXT NOT NULL,                      -- the file that was checked; a newer upload is a different path and needs a new check
    score      INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    level      TEXT NOT NULL CHECK (level IN ('good','ok','poor')),
    usable     BOOLEAN NOT NULL,
    issues     JSONB NOT NULL DEFAULT '[]'::jsonb,
    details    JSONB NOT NULL DEFAULT '{}'::jsonb,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, slot)
);
ALTER TABLE public.kyc_document_checks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.kyc_document_checks TO service_role;


-- Enterprise plan, and the one query the financial statements need: debits and credits per account over a date range.
-- Keep in step with the inline migration in apps/api/src/index.ts.

-- Enterprise is billed by agreement, so it carries no list price here. Accounting is the first feature that needs it.
INSERT INTO public.subscription_plans (id, name, price_zmw, max_members, features)
VALUES ('enterprise', 'Enterprise', 0, NULL, '{"team": true, "products": true, "payment_links": true, "accounting": true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.accounting_balances(p_org uuid, p_from date, p_to date)
RETURNS TABLE (account_id uuid, debit numeric, credit numeric)
LANGUAGE sql STABLE
AS $$
    SELECT l.account_id, COALESCE(SUM(l.debit), 0), COALESCE(SUM(l.credit), 0)
    FROM public.journal_lines l
    JOIN public.journal_entries e ON e.id = l.journal_entry_id
    WHERE e.organization_id = p_org
      AND (p_from IS NULL OR e.entry_date >= p_from)
      AND (p_to IS NULL OR e.entry_date <= p_to)
    GROUP BY l.account_id
$$;
REVOKE ALL ON FUNCTION public.accounting_balances(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_balances(uuid, date, date) TO service_role;

-- Suppliers, purchase bills and a stock movement history. Enterprise plan. Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.suppliers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL,
    name               TEXT NOT NULL,
    contact_person     TEXT,
    phone              TEXT,
    email              TEXT,
    address            TEXT,
    tax_number         TEXT,                          -- the supplier's TPIN
    payment_terms_days INTEGER NOT NULL DEFAULT 30,
    notes              TEXT,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_org ON public.suppliers (organization_id);

CREATE TABLE IF NOT EXISTS public.purchase_bills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    supplier_id     UUID NOT NULL REFERENCES public.suppliers(id),
    bill_number     TEXT,
    bill_date       DATE NOT NULL,
    due_date        DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIAL','PAID','VOID')),
    total           NUMERIC(14,2) NOT NULL CHECK (total >= 0),
    amount_paid     NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_org ON public.purchase_bills (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_supplier ON public.purchase_bills (supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_bills_number ON public.purchase_bills (organization_id, supplier_id, bill_number) WHERE bill_number IS NOT NULL AND status <> 'VOID';

CREATE TABLE IF NOT EXISTS public.purchase_bill_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id     UUID NOT NULL REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
    product_id  UUID,                                  -- set when the line is stock that goes into inventory
    account_id  UUID,                                  -- the expense account when the line is not stock
    description TEXT NOT NULL,
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost   NUMERIC(14,2) NOT NULL CHECK (unit_cost >= 0),
    line_total  NUMERIC(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_lines_bill ON public.purchase_bill_lines (bill_id);

CREATE TABLE IF NOT EXISTS public.bill_payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    bill_id         UUID NOT NULL REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    paid_on         DATE NOT NULL,
    method          TEXT,
    reference       TEXT,
    account_id      UUID NOT NULL,                     -- the bank, cash or wallet account the money left
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bill_payments_bill ON public.bill_payments (bill_id);

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    product_id      UUID NOT NULL,
    quantity_change INTEGER NOT NULL,
    unit_cost       NUMERIC(14,2),
    reason          TEXT NOT NULL CHECK (reason IN ('PURCHASE','ADJUSTMENT','COUNT','SALE','RETURN','VOID')),
    ref_type        TEXT,
    ref_id          UUID,
    note            TEXT,
    balance_after   INTEGER,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements (organization_id, product_id, created_at DESC);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14,2);

-- The ledger only accepts known entry types. Add the ones the accounting import and purchasing post.
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
    CHECK (source_type = ANY (ARRAY['CASHBOOK','LINE_ITEMS','OPENING','MANUAL','RECLASS','MASTERFEES','INVOICE','IMPORT','PURCHASE_BILL','BILL_PAYMENT','STOCK_ADJUSTMENT']));

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.suppliers, public.purchase_bills, public.purchase_bill_lines, public.bill_payments, public.stock_movements TO service_role;



-- Follow-ups: stock by colour or size on bills, wallet payments for supplier bills, and sales feeding stock history and cost of goods sold.
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payout_method TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payout_bank_code TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payout_account TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payout_account_name TEXT;
ALTER TABLE public.purchase_bill_lines ADD COLUMN IF NOT EXISTS variant_id TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS variant_id TEXT;
ALTER TABLE public.purchase_bills ADD COLUMN IF NOT EXISTS requisition_id UUID;
ALTER TABLE public.bill_payments ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS requisition_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_payments_requisition ON public.bill_payments (requisition_id) WHERE requisition_id IS NOT NULL;
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
    CHECK (source_type = ANY (ARRAY['CASHBOOK','LINE_ITEMS','OPENING','MANUAL','RECLASS','MASTERFEES','INVOICE','IMPORT','PURCHASE_BILL','BILL_PAYMENT','STOCK_ADJUSTMENT','STOCK_SALE']));

-- Accounting controls: lock a period so past figures can't change, and the query behind the cash flow statement.
-- Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.accounting_settings (
    organization_id UUID PRIMARY KEY,
    locked_through  DATE,                              -- no entry dated on or before this day can be added, changed or removed
    updated_by      UUID,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.accounting_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.accounting_settings TO service_role;

-- Enforced in the database so every way of writing to the ledger (cashbook, invoices, imports, journals) obeys it.
CREATE OR REPLACE FUNCTION public.guard_locked_period() RETURNS trigger LANGUAGE plpgsql AS $guard$
DECLARE
    lock_date DATE;
    d DATE;
BEGIN
    IF TG_TABLE_NAME = 'journal_entries' THEN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            SELECT locked_through INTO lock_date FROM public.accounting_settings WHERE organization_id = OLD.organization_id;
            IF lock_date IS NOT NULL AND OLD.entry_date <= lock_date THEN
                RAISE EXCEPTION 'The books are locked through %. Entries on or before that date cannot be changed.', lock_date;
            END IF;
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            SELECT locked_through INTO lock_date FROM public.accounting_settings WHERE organization_id = NEW.organization_id;
            IF lock_date IS NOT NULL AND NEW.entry_date <= lock_date THEN
                RAISE EXCEPTION 'The books are locked through %. Entries on or before that date cannot be added.', lock_date;
            END IF;
        END IF;
    ELSE
        SELECT s.locked_through, e.entry_date INTO lock_date, d
        FROM public.journal_entries e JOIN public.accounting_settings s ON s.organization_id = e.organization_id
        WHERE e.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_entry_id ELSE NEW.journal_entry_id END;
        IF lock_date IS NOT NULL AND d <= lock_date THEN
            RAISE EXCEPTION 'The books are locked through %. Entries on or before that date cannot be changed.', lock_date;
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$guard$;

DROP TRIGGER IF EXISTS trg_guard_locked_entries ON public.journal_entries;
CREATE TRIGGER trg_guard_locked_entries BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_locked_period();
DROP TRIGGER IF EXISTS trg_guard_locked_lines ON public.journal_lines;
CREATE TRIGGER trg_guard_locked_lines BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.guard_locked_period();

-- For each non-cash account, how much cash its entries brought in (positive) or took out (negative) over a period.
CREATE OR REPLACE FUNCTION public.accounting_cash_effects(p_org uuid, p_from date, p_to date)
RETURNS TABLE (account_id uuid, effect numeric)
LANGUAGE sql STABLE
AS $$
    SELECT l.account_id, COALESCE(SUM(l.credit - l.debit), 0)
    FROM public.journal_lines l
    JOIN public.journal_entries e ON e.id = l.journal_entry_id
    JOIN public.accounts a ON a.id = l.account_id
    WHERE e.organization_id = p_org
      AND (p_from IS NULL OR e.entry_date >= p_from)
      AND (p_to IS NULL OR e.entry_date <= p_to)
      AND NOT (a.type = 'ASSET' AND a.subtype ~* '(bank|wallet|cash|savings)')
      AND EXISTS (
          SELECT 1 FROM public.journal_lines c JOIN public.accounts ca ON ca.id = c.account_id
          WHERE c.journal_entry_id = e.id AND ca.type = 'ASSET' AND ca.subtype ~* '(bank|wallet|cash|savings)')
    GROUP BY l.account_id
$$;
REVOKE ALL ON FUNCTION public.accounting_cash_effects(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_cash_effects(uuid, date, date) TO service_role;


-- A history of changes to the things an accountant has to be able to explain: the chart of accounts, hand-made and imported journals,
-- changes to cashbook classifications, supplier bills, customer invoices and the period lock. Written by the database itself, so it
-- covers edits made anywhere in the app. Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.accounting_changes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    table_name      TEXT NOT NULL,
    row_id          UUID,
    op              TEXT NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE')),
    changed         JSONB NOT NULL,                   -- INSERT/DELETE: the whole row; UPDATE: { column: { from, to } } for what changed
    actor           UUID,                             -- who, where the row itself says so (updated_by or created_by)
    at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_accounting_changes_org ON public.accounting_changes (organization_id, at DESC);
ALTER TABLE public.accounting_changes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.accounting_changes TO service_role;

-- TG_ARGV[0] is the comma-separated list of columns whose changes are worth recording (empty = all but updated_at).
-- Logging must never stop real work, so any failure inside is swallowed.
CREATE OR REPLACE FUNCTION public.log_accounting_change() RETURNS trigger LANGUAGE plpgsql AS $log$
DECLARE
    o JSONB; n JSONB; org UUID; k TEXT; diff JSONB := '{}'::jsonb; watch TEXT[];
BEGIN
    IF TG_OP = 'DELETE' THEN o := to_jsonb(OLD); n := NULL; ELSIF TG_OP = 'INSERT' THEN o := NULL; n := to_jsonb(NEW); ELSE o := to_jsonb(OLD); n := to_jsonb(NEW); END IF;
    -- Entries the system posts on its own (cashbook, MasterFees) are rebuilt all the time and are not edits.
    IF TG_TABLE_NAME = 'journal_entries' AND COALESCE(n->>'source_type', o->>'source_type') IN ('CASHBOOK','MASTERFEES','LINE_ITEMS') THEN RETURN NULL; END IF;
    org := NULLIF(COALESCE(n->>'organization_id', o->>'organization_id'), '')::uuid;
    IF TG_OP = 'UPDATE' THEN
        watch := CASE WHEN COALESCE(TG_ARGV[0], '') = '' THEN NULL ELSE string_to_array(TG_ARGV[0], ',') END;
        FOR k IN SELECT jsonb_object_keys(n) LOOP
            CONTINUE WHEN k = 'updated_at';
            CONTINUE WHEN watch IS NOT NULL AND NOT (k = ANY (watch));
            IF o->k IS DISTINCT FROM n->k THEN diff := diff || jsonb_build_object(k, jsonb_build_object('from', o->k, 'to', n->k)); END IF;
        END LOOP;
        IF diff = '{}'::jsonb THEN RETURN NULL; END IF;
    ELSE
        diff := COALESCE(n, o);
    END IF;
    INSERT INTO public.accounting_changes (organization_id, table_name, row_id, op, changed, actor)
    VALUES (org, TG_TABLE_NAME, NULLIF(COALESCE(n->>'id', o->>'id'), '')::uuid, TG_OP, diff,
            NULLIF(COALESCE(n->>'updated_by', n->>'created_by', o->>'updated_by', o->>'created_by'), '')::uuid);
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$log$;

DROP TRIGGER IF EXISTS trg_log_accounts ON public.accounts;
CREATE TRIGGER trg_log_accounts AFTER INSERT OR UPDATE OR DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('code,name,type,subtype,is_active,qb_account_id,sage_account_id');
DROP TRIGGER IF EXISTS trg_log_cashbook ON public.cashbook_entries;
CREATE TRIGGER trg_log_cashbook AFTER UPDATE OR DELETE ON public.cashbook_entries FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('account_id,description,debit,credit,date');
DROP TRIGGER IF EXISTS trg_log_journals ON public.journal_entries;
CREATE TRIGGER trg_log_journals AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('entry_date,description,reference_number');
DROP TRIGGER IF EXISTS trg_log_suppliers ON public.suppliers;
CREATE TRIGGER trg_log_suppliers AFTER INSERT OR UPDATE OR DELETE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('name,tax_number,payment_terms_days,is_active,payout_method,payout_account,payout_bank_code');
DROP TRIGGER IF EXISTS trg_log_bills ON public.purchase_bills;
CREATE TRIGGER trg_log_bills AFTER INSERT OR UPDATE OR DELETE ON public.purchase_bills FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('status,total,due_date,bill_date,supplier_id');
DROP TRIGGER IF EXISTS trg_log_invoices ON public.customer_invoices;
CREATE TRIGGER trg_log_invoices AFTER UPDATE OR DELETE ON public.customer_invoices FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('status,total,voided_at,issue_date,follow_up_date,customer_id');
DROP TRIGGER IF EXISTS trg_log_settings ON public.accounting_settings;
CREATE TRIGGER trg_log_settings AFTER INSERT OR UPDATE OR DELETE ON public.accounting_settings FOR EACH ROW EXECUTE FUNCTION public.log_accounting_change('locked_through');


-- VAT: settings per business, a record of every VAT amount charged or paid, and filed returns. Keep in step with the inline migration in apps/api/src/index.ts.

ALTER TABLE public.accounting_settings ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.accounting_settings ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 16;
ALTER TABLE public.accounting_settings ADD COLUMN IF NOT EXISTS tpin TEXT;
ALTER TABLE public.accounting_settings ADD COLUMN IF NOT EXISTS vat_number TEXT;

ALTER TABLE public.customer_invoices ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_bills ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_bill_lines ADD COLUMN IF NOT EXISTS tax_code TEXT;
ALTER TABLE public.purchase_bill_lines ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

-- One row per VAT amount: OUTPUT is VAT charged to customers, INPUT is VAT paid to suppliers.
CREATE TABLE IF NOT EXISTS public.vat_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    direction       TEXT NOT NULL CHECK (direction IN ('OUTPUT','INPUT')),
    tax_code        TEXT NOT NULL CHECK (tax_code IN ('STANDARD','ZERO','EXEMPT')),
    tx_date         DATE NOT NULL,
    net             NUMERIC(14,2) NOT NULL,
    vat             NUMERIC(14,2) NOT NULL DEFAULT 0,
    source_type     TEXT NOT NULL,                      -- INVOICE, PURCHASE_BILL, or MANUAL
    source_id       UUID NOT NULL,
    counterparty    TEXT,
    reference       TEXT,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vat_tx_org_date ON public.vat_transactions (organization_id, tx_date);
CREATE INDEX IF NOT EXISTS idx_vat_tx_source ON public.vat_transactions (organization_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS public.vat_returns (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL,
    period_start      DATE NOT NULL,
    period_end        DATE NOT NULL,
    totals            JSONB NOT NULL,                   -- the figures as they stood when it was filed
    payment_reference TEXT,
    filed_by          UUID,
    filed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, period_start, period_end)
);

ALTER TABLE public.vat_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_returns ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.vat_transactions, public.vat_returns TO service_role;


-- Payroll in the books: accruing each approved run (gross pay, employer contributions, and what is owed to ZRA, NAPSA and NHIMA),
-- and recording the payments made to them. Keep in step with the inline migration in apps/api/src/index.ts.

-- A date turns accruals on from that day. Runs approved before it are not touched: their pay was already booked another way.
ALTER TABLE public.accounting_settings ADD COLUMN IF NOT EXISTS payroll_accrual_from DATE;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS accrued_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.statutory_payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    agency          TEXT NOT NULL CHECK (agency IN ('PAYE','NAPSA','NHIMA')),
    period_year     INTEGER NOT NULL,
    period_month    INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    paid_on         DATE NOT NULL,
    method          TEXT,
    reference       TEXT,
    account_id      UUID,                              -- the bank or wallet account the money left, when it was posted to the books
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_statutory_payments_period ON public.statutory_payments (organization_id, period_year, period_month);
ALTER TABLE public.statutory_payments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.statutory_payments TO service_role;

ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
    CHECK (source_type = ANY (ARRAY['CASHBOOK','LINE_ITEMS','OPENING','MANUAL','RECLASS','MASTERFEES','INVOICE','IMPORT','PURCHASE_BILL','BILL_PAYMENT','STOCK_ADJUSTMENT','STOCK_SALE','PAYROLL_RUN','STATUTORY_PAYMENT']));


-- Credit notes: a customer credit note takes money off what a customer owes (a return, a discount, a mistake), and a supplier credit
-- note takes money off what you owe a supplier. Either can be applied to an invoice or bill, or kept as credit.
-- Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.credit_notes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    direction      TEXT NOT NULL CHECK (direction IN ('CUSTOMER','SUPPLIER')),
    note_number    TEXT NOT NULL,
    customer_id    UUID,
    supplier_id    UUID,
    party_name     TEXT NOT NULL,
    invoice_id     UUID,                              -- the invoice a customer credit note is against
    bill_id        UUID,                              -- the bill a supplier credit note is against
    issue_date     DATE NOT NULL,
    reason         TEXT,
    items          JSONB NOT NULL DEFAULT '[]'::jsonb,
    net            NUMERIC(14,2) NOT NULL,
    vat_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    total          NUMERIC(14,2) NOT NULL CHECK (total > 0),
    amount_applied NUMERIC(14,2) NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','APPLIED','VOID')),
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, direction, note_number)
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_org ON public.credit_notes (organization_id, direction, issue_date DESC);
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.credit_notes TO service_role;

-- A credit applied to an invoice is one more row in invoice_payments (the invoice's paid amount is the sum of that table),
-- but it has no cashbook entry behind it.
ALTER TABLE public.invoice_payments ALTER COLUMN cashbook_entry_id DROP NOT NULL;
ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS credit_note_id UUID REFERENCES public.credit_notes(id) ON DELETE CASCADE;
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS credit_note_id UUID REFERENCES public.credit_notes(id) ON DELETE CASCADE;

ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
    CHECK (source_type = ANY (ARRAY['CASHBOOK','LINE_ITEMS','OPENING','MANUAL','RECLASS','MASTERFEES','INVOICE','IMPORT','PURCHASE_BILL','BILL_PAYMENT','STOCK_ADJUSTMENT','STOCK_SALE','PAYROLL_RUN','STATUTORY_PAYMENT','CREDIT_NOTE']));


-- Quotes (offers to customers that can become invoices) and purchase orders (orders to suppliers that become bills when the goods arrive).
-- Neither touches the books until they turn into an invoice or a bill. Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.quotes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    quote_number    TEXT NOT NULL,
    customer_id     UUID,
    customer_name   TEXT NOT NULL,
    customer_phone  TEXT,
    customer_email  TEXT,
    issue_date      DATE NOT NULL,
    valid_until     DATE NOT NULL,
    items           JSONB NOT NULL DEFAULT '[]'::jsonb,   -- in the same shape an invoice's lines are created from
    total           NUMERIC(14,2) NOT NULL CHECK (total > 0),
    status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACCEPTED','DECLINED','INVOICED','CANCELLED')),
    invoice_id      UUID,
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, quote_number)
);
CREATE INDEX IF NOT EXISTS idx_quotes_org ON public.quotes (organization_id, issue_date DESC);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    supplier_id     UUID NOT NULL REFERENCES public.suppliers(id),
    po_number       TEXT NOT NULL,
    order_date      DATE NOT NULL,
    expected_date   DATE,
    status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PART_RECEIVED','RECEIVED','CANCELLED')),
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, po_number)
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org ON public.purchase_orders (organization_id, status);

CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id        UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id   UUID,
    variant_id   TEXT,
    account_id   UUID,
    description  TEXT NOT NULL,
    quantity     INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost    NUMERIC(14,2) NOT NULL CHECK (unit_cost >= 0),
    tax_code     TEXT,
    received_qty INTEGER NOT NULL DEFAULT 0 CHECK (received_qty >= 0)
);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po ON public.purchase_order_lines (po_id);
ALTER TABLE public.purchase_bills ADD COLUMN IF NOT EXISTS purchase_order_id UUID;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.quotes, public.purchase_orders, public.purchase_order_lines TO service_role;


        ALTER TABLE public.imported_products ADD COLUMN IF NOT EXISTS specs JSONB;
CREATE TABLE IF NOT EXISTS public.catalog_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,                       -- "Cement 50 kg bag"
    category    TEXT NOT NULL,                       -- "Cement"
    vertical    TEXT NOT NULL DEFAULT 'CONSTRUCTION',-- CONSTRUCTION, GROCERY, ...
    unit        TEXT NOT NULL,                       -- what one price is for: bag, piece, tonne, metre, litre, kg, sheet, roll, load
    unit_detail TEXT,                                -- "50 kg"
    brand       TEXT,
    keywords    TEXT,                                -- extra search words
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_catalog_items_category ON public.catalog_items (vertical, category) WHERE is_active;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS catalog_item_id UUID REFERENCES public.catalog_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_catalog_item ON public.products (catalog_item_id) WHERE catalog_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.price_points (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_item_id UUID NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
    source_type     TEXT NOT NULL DEFAULT 'SUPPLIER_LIST' CHECK (source_type IN ('SUPPLIER_LIST','SHOPPER_REPORT','RFQ_QUOTE','BUSINESS_AGGREGATE')),
    place_name      TEXT NOT NULL,                   -- "Chilanga Cement depot" or "ShopRite Garden City"
    town            TEXT,
    province        TEXT,
    address         TEXT,
    phone           TEXT,
    org_id          UUID,                            -- the MoneyWise business, when the place is one
    price           NUMERIC(14,2) NOT NULL CHECK (price > 0),   -- for one unit of the catalogue item
    min_qty         INTEGER,                         -- the price applies from this quantity (bulk price)
    delivers        BOOLEAN NOT NULL DEFAULT FALSE,
    delivery_note   TEXT,
    observed_on     DATE NOT NULL DEFAULT CURRENT_DATE,
    status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PENDING','REJECTED','EXPIRED')),
    trust           TEXT NOT NULL DEFAULT 'ENTERED' CHECK (trust IN ('ENTERED','VERIFIED')),
    evidence_url    TEXT,                            -- a photo of the price tag or receipt
    reported_by     UUID,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_points_item ON public.price_points (catalog_item_id, status, observed_on DESC);
CREATE INDEX IF NOT EXISTS idx_price_points_town ON public.price_points (town);

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_points ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.catalog_items, public.price_points TO service_role;
CREATE TABLE IF NOT EXISTS public.rfq_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference         TEXT NOT NULL UNIQUE,
    buyer_org_id      UUID NOT NULL,
    buyer_user_id     UUID NOT NULL,
    buyer_name        TEXT,
    buyer_phone       TEXT,
    catalog_item_id   UUID REFERENCES public.catalog_items(id) ON DELETE SET NULL,
    title             TEXT NOT NULL,
    details           TEXT,
    quantity          NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
    unit              TEXT NOT NULL,
    delivery_town     TEXT,
    delivery_province TEXT,
    delivery_address  TEXT,
    needed_by         DATE,
    status            TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','AWARDED','CLOSED','CANCELLED','EXPIRED')),
    expires_at        TIMESTAMPTZ NOT NULL,
    awarded_quote_id  UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rfq_requests_buyer ON public.rfq_requests (buyer_org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfq_requests_open ON public.rfq_requests (status, expires_at) WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS public.rfq_quotes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id         UUID NOT NULL REFERENCES public.rfq_requests(id) ON DELETE CASCADE,
    supplier_org_id UUID,                            -- the MoneyWise business, or null when the team entered a quote taken by phone
    supplier_name  TEXT NOT NULL,
    supplier_phone TEXT,
    unit_price     NUMERIC(14,2) NOT NULL CHECK (unit_price > 0),
    quantity       NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
    delivery_fee   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    total          NUMERIC(14,2) NOT NULL CHECK (total > 0),
    delivers       BOOLEAN NOT NULL DEFAULT FALSE,
    valid_until    DATE,
    note           TEXT,
    status         TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','ACCEPTED','DECLINED','WITHDRAWN')),
    product_id     UUID REFERENCES public.products(id) ON DELETE SET NULL,     -- the private listing made when the quote is accepted
    price_point_id UUID REFERENCES public.price_points(id) ON DELETE SET NULL, -- the price record this quote added to the comparison
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rfq_quotes_rfq ON public.rfq_quotes (rfq_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rfq_quotes_supplier ON public.rfq_quotes (rfq_id, supplier_org_id) WHERE supplier_org_id IS NOT NULL;

ALTER TABLE public.rfq_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_quotes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.rfq_requests, public.rfq_quotes TO service_role;
ALTER TABLE public.price_points ADD COLUMN IF NOT EXISTS place_key     TEXT;                       -- the place's name boiled down, so "ShopRite  Garden City" and "Shoprite, Garden City" match
ALTER TABLE public.price_points ADD COLUMN IF NOT EXISTS flag          TEXT;                       -- OUTLIER: held for review because it is far from the other prices
ALTER TABLE public.price_points ADD COLUMN IF NOT EXISTS confirmations INTEGER NOT NULL DEFAULT 1; -- how many different shoppers have reported about this price here
ALTER TABLE public.price_points ADD COLUMN IF NOT EXISTS review_note   TEXT;
ALTER TABLE public.price_points ADD COLUMN IF NOT EXISTS points_awarded INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_price_points_place_key ON public.price_points (catalog_item_id, place_key, observed_on DESC) WHERE place_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_points_reporter ON public.price_points (reported_by, created_at DESC) WHERE reported_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_points_pending ON public.price_points (status, created_at) WHERE status = 'PENDING';
CREATE TABLE IF NOT EXISTS public.org_gateway_credentials (
    organization_id           UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    lipila_api_key_enc        TEXT,                        -- the wallet's API key, encrypted (AES-256-GCM)
    lipila_webhook_secret_enc TEXT,                        -- that wallet's webhook signing secret, encrypted (empty when the shared one is used)
    lipila_env                TEXT NOT NULL DEFAULT 'sandbox' CHECK (lipila_env IN ('sandbox', 'production')),
    lipila_enabled            BOOLEAN NOT NULL DEFAULT FALSE,
    key_hint                  TEXT,                        -- the last characters of the key, so the owner can tell which one is saved
    updated_by                UUID,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lipila_card_sessions (
    reference       TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    net_amount      NUMERIC(14,2) NOT NULL CHECK (net_amount > 0),       -- what the business should receive
    charged_amount  NUMERIC(14,2) NOT NULL CHECK (charged_amount > 0),   -- what the customer's card is charged (net plus Lipila's fee)
    fee_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'ZMW',
    status          TEXT NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED', 'PROCESSING', 'SUCCESSFUL', 'FAILED')),
    redirect_url    TEXT,
    customer        JSONB,
    context         JSONB,                                               -- where the sale came from: payment link, quick link, store
    failure_reason  TEXT,
    record_error    TEXT,                                                -- set when Lipila confirmed the payment but we could not record it yet
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalized_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lipila_card_sessions_org ON public.lipila_card_sessions (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lipila_card_sessions_open ON public.lipila_card_sessions (status, created_at) WHERE status IN ('INITIATED', 'PROCESSING');

ALTER TABLE public.org_gateway_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lipila_card_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_gateway_credentials, public.lipila_card_sessions FROM anon, authenticated;
GRANT ALL ON public.org_gateway_credentials, public.lipila_card_sessions TO service_role;
        `);

        // Refresh PostgREST schema cache
        console.log('[Migration] Reloading PostgREST schema cache...');
        await migrationPool.query("NOTIFY pgrst, 'reload config';");

        await migrationPool.query('UPDATE public.schema_migrations SET version = $1 WHERE id = 1;', [MIGRATION_VERSION]);
        console.log(`[Migration] Marked schema at version ${MIGRATION_VERSION}.`);

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
app.use(cors({
    origin: function (origin, callback) {
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'x-custom-header', 'x-organization-id']
}));

// Mounted BEFORE express.json() so the exact bytes Vercel signed are what we
// verify — the global JSON parser below would either mangle the raw body for
// HMAC verification or throw outright on NDJSON payloads (not valid single
// JSON). This route fully handles+responds itself and never calls next(),
// so requests here never reach the global parser.
app.use('/webhooks', express.raw({ type: '*/*', limit: '5mb' }), webhooksRoutes);

// A photo search sends a (downsized) picture, which is bigger than the default body limit.
app.use('/marketplace/image-search', express.json({ limit: '2mb' }));
app.use('/accounting/import', express.json({ limit: '25mb' }));
// Uploaded HTML email designs (CRM campaigns) are bigger than the default 100kb JSON limit.
// express.json skips bodies that are already parsed, so this runs instead of the global parser here.
app.use(['/crm/campaigns/send', '/crm/email-designs'], express.json({ limit: '2mb' }));

app.use(express.json({
    verify: (req: any, res, buf) => {
        req.rawBody = buf;
    }
}));

// Smile ID tells us how a selfie-to-ID comparison went. Not signed in: the call is proved genuine by its HMAC signature.
app.post('/kyc-face-match/callback', async (req, res) => {
    try { res.status(await handleFaceMatchCallback(req.headers, req.body) ? 200 : 401).end(); } catch { res.status(500).end(); }
});

// After any successful authenticated mutation, broadcast an org-scoped cache
// invalidation so other signed-in devices refresh live (see lib/realtimeBroadcast).
app.use(broadcastAfterWrite);

// Heartbeats for calls dispatched by the internal scheduler (X-Cron-Job + shared secret only).
app.use(cronHeartbeat);

// Routes
app.use('/auth', authRoutes);
app.use('/requisitions', requisitionRoutes);
app.use('/accounts', accountRoutes);
app.use('/vouchers', voucherRoutes);
app.use('/cashbook', cashbookRoutes);
app.use('/integrations', integrationRoutes);
app.use('/users', userRoutes);
app.use('/rewards', rewardsRoutes);
app.use('/pay-links', payLinkRoutes);
app.use('/ai', aiRoutes);
app.use('/organizations', organizationRoutes);
app.use('/organizations/products', productRoutes);
app.use('/organizations/payment-links', paymentLinkRoutes);
app.use('/departments', departmentRoutes);
app.use('/admin', adminRoutes);
app.use('/onboarding', onboardingRoutes);
app.use('/budgets', budgetRoutes);
app.use('/reports', reportRoutes);
app.use('/journal-entries', journalRoutes);
app.use('/lenco', lencoRoutes);
app.use('/lipila', lipilaRoutes);
app.use('/payroll', payrollRoutes);
app.use('/crm', crmRoutes);
app.use('/invoices', invoiceRoutes);
app.use('/schedules', scheduleRoutes);
app.use('/automations', automationRoutes);
app.use('/billing', billingRoutes);
app.use('/cron', cronRoutes);
app.use('/investments', investRoutes);
app.use('/savings', savingsRoutes);
app.use('/developer', developerRoutes);
app.use('/v1', publicApiRoutes);
app.use('/oauth', oauthRoutes);
app.use('/momo-capture', momoCaptureRoutes);
app.use('/marketplace', marketplaceRoutes);
app.use('/loans', loansRoutes);
app.use('/accounting', accountingRoutes);
app.use('/purchasing', purchasingRoutes);
// NOTE: /developer and /v1 (API-key feature) are unhooked until developer.routes.ts,
// publicApi.routes.ts and the api_keys migration are committed — index.ts imported files
// that only existed locally, which broke every API deploy from 125c6dd on.

// Dump the full route table only when explicitly debugging. On Vercel this
// module reloads on every cold start, and printing all ~200 routes each time
// flooded the log drain (it was ~95% of captured volume, billed by Vercel).
if (process.env.DEBUG_ROUTES === 'true') {
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
}

app.get('/', (req: any, res: any) => {
    res.send('Money Wise Pro API is running securely');
});

app.get(['/docs', '/docs/api', '/api-docs'], (req: any, res: any) => {
    res.redirect('https://moneywise.blueopus.cloud/docs/api');
});

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
    console.error('[API Global Error]:', err);
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
});

// For local development hot reloading
if (process.env.NODE_ENV !== 'production') {
    const server = app.listen(Number(port), () => {
        console.log(`Server is running on port ${port}`);
        startImportRefresh();
        startFundFeeds();
    });
    server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[API] Port ${port} is already in use.`);
        } else {
            console.error('[API] Server error:', err);
        }
    });
}

// Export for Vercel
export default app;

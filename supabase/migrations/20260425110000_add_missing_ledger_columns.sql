-- Migration to add account_id and QuickBooks sync fields to cashbook_entries
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/klfeluphcutgppkhaxyl/sql)

-- 1. Add account_id column for categorization
ALTER TABLE public.cashbook_entries 
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.chart_of_accounts(id);

-- 2. Add QuickBooks sync status fields
ALTER TABLE public.cashbook_entries 
ADD COLUMN IF NOT EXISTS qb_sync_status VARCHAR(20) DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS qb_sync_error TEXT,
ADD COLUMN IF NOT EXISTS qb_sync_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS qb_deposit_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS qb_purchase_id VARCHAR(100);

-- 3. Create index for faster filtering by account
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_account_id ON public.cashbook_entries(account_id);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload config';

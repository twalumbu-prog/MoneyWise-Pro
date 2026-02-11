-- Create integrations table
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL UNIQUE, -- 'QUICKBOOKS'
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  refresh_token_expires_at TIMESTAMP WITH TIME ZONE,
  realm_id VARCHAR(100),
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add QuickBooks sync fields to requisitions
ALTER TABLE public.requisitions 
ADD COLUMN IF NOT EXISTS qb_expense_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS qb_sync_status VARCHAR(20) DEFAULT 'PENDING' CHECK (qb_sync_status IN ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED')),
ADD COLUMN IF NOT EXISTS qb_sync_error TEXT,
ADD COLUMN IF NOT EXISTS qb_sync_at TIMESTAMP WITH TIME ZONE;

-- Add QuickBooks account ID to chart_of_accounts
ALTER TABLE public.chart_of_accounts
ADD COLUMN IF NOT EXISTS qb_account_id VARCHAR(100);

-- Enable RLS on integrations (should be restricted to admins)
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid errors on re-run)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'integrations' AND policyname = 'Admins can view integrations') THEN
        DROP POLICY "Admins can view integrations" ON public.integrations;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'integrations' AND policyname = 'Admins can update integrations') THEN
        DROP POLICY "Admins can update integrations" ON public.integrations;
    END IF;
END $$;

CREATE POLICY "Admins can view integrations" ON public.integrations
FOR SELECT USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'));

CREATE POLICY "Admins can update integrations" ON public.integrations
FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'));

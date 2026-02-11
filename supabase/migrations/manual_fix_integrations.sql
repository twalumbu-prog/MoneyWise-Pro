-- Create the integrations table if it doesn't exist
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

-- Add columns to requisitions table
ALTER TABLE requisitions 
ADD COLUMN IF NOT EXISTS qb_expense_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS qb_sync_status VARCHAR(20) DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS qb_sync_error TEXT,
ADD COLUMN IF NOT EXISTS qb_sync_at TIMESTAMP WITH TIME ZONE;

-- Add column to chart_of_accounts table
ALTER TABLE chart_of_accounts
ADD COLUMN IF NOT EXISTS qb_account_id VARCHAR(100);

-- Enable RLS on the new table (optional but good practice)
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to view integrations (adjust as needed)
CREATE POLICY "Allow authenticated users to view integrations" 
ON public.integrations FOR SELECT 
TO authenticated 
USING (true);

-- Create policy to allow authenticated users to insert/update integrations
CREATE POLICY "Allow authenticated users to manage integrations" 
ON public.integrations FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Force valid permissions for the API role
GRANT ALL ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;

-- IMPORTANT: Reload the schema cache
NOTIFY pgrst, 'reload config';

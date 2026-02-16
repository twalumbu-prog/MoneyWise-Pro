-- Create sync_logs table for audit trail
CREATE TABLE IF NOT EXISTS public.sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_id UUID REFERENCES public.requisitions(id),
    qb_expense_id VARCHAR(100),
    synced_by UUID REFERENCES public.users(id),
    status VARCHAR(50) NOT NULL, -- 'SUCCESS', 'FAILED'
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert logs (service role will bypass anyway, but good for completeness)
CREATE POLICY "Authenticated users can view sync logs" ON public.sync_logs
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow service role to manage integration related tables safely
GRANT ALL ON public.sync_logs TO service_role;
GRANT ALL ON public.integrations TO service_role;

-- Optional: Clear existing plain-text tokens to force re-authentication with encryption
-- WARNING: This will disconnect all current users. Uncomment if acceptable.
-- UPDATE public.integrations SET access_token = NULL, refresh_token = NULL, token_expires_at = NULL;

-- Create customers table for CRM feature
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

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_customers_org_id ON public.customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);

-- Enable RLS on customers table
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for customers table
DROP POLICY IF EXISTS "Manage customers of own organization" ON public.customers;
CREATE POLICY "Manage customers of own organization" ON public.customers
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Grant privileges
GRANT ALL ON public.customers TO service_role;
GRANT ALL ON public.customers TO postgres;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload config';

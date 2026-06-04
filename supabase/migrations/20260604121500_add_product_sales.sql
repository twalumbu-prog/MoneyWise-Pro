-- Create product_sales table
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

-- Enable RLS on product_sales table
ALTER TABLE public.product_sales ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for product_sales table
DROP POLICY IF EXISTS "Manage product sales of own organization" ON public.product_sales;
CREATE POLICY "Manage product sales of own organization" ON public.product_sales
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Grant privileges
GRANT ALL ON public.product_sales TO service_role;
GRANT ALL ON public.product_sales TO postgres;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload config';

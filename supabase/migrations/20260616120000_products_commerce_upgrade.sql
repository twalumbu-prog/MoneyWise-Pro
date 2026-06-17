-- =============================================================================
-- Products & Services commerce upgrade
-- =============================================================================
-- Adds image, type, and accounting-routing columns to products; a single-use
-- payment_links table for the "Share" one-time checkout flow; and a public
-- storage bucket for product images (mirrors the organization-logos setup).
-- Additive and idempotent.
-- =============================================================================

-- 1. Extend products -----------------------------------------------------------
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'PRODUCT',
    ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES public.organization_wallets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS income_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

-- product_type domain (PRODUCT = tangible fixed price + qty, SERVICE_FIXED = one
-- established price, SERVICE_VARIABLE = price set by staff on a share link,
-- DONATION = amount entered by the paying customer).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_product_type_check'
    ) THEN
        ALTER TABLE public.products
            ADD CONSTRAINT products_product_type_check
            CHECK (product_type IN ('PRODUCT','SERVICE_FIXED','SERVICE_VARIABLE','DONATION'));
    END IF;
END$$;

-- 2. payment_links — one-time, single-use pre-filled checkout links ------------
CREATE TABLE IF NOT EXISTS public.payment_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    token           TEXT NOT NULL UNIQUE,
    customer_name   TEXT NOT NULL,
    customer_phone  TEXT NOT NULL,
    amount          NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    wallet_id       UUID REFERENCES public.organization_wallets(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAID','CANCELLED')),
    reference       TEXT,
    created_by      UUID REFERENCES public.users(id),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at         TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_payment_links_token ON public.payment_links (token);
CREATE INDEX IF NOT EXISTS idx_payment_links_org_status ON public.payment_links (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_links_reference ON public.payment_links (reference);

ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Manage payment links of own organization" ON public.payment_links;
CREATE POLICY "Manage payment links of own organization" ON public.payment_links
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

GRANT ALL ON public.payment_links TO service_role;
GRANT ALL ON public.payment_links TO postgres;

-- 3. Storage bucket for product images (mirrors organization-logos) ------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow public read from product-images" ON storage.objects;
CREATE POLICY "Allow public read from product-images" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Allow authenticated uploads to product-images" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to product-images" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Allow authenticated management of product-images" ON storage.objects;
CREATE POLICY "Allow authenticated management of product-images" ON storage.objects
    FOR ALL TO authenticated USING (bucket_id = 'product-images') WITH CHECK (bucket_id = 'product-images');

NOTIFY pgrst, 'reload config';

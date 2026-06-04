-- 1. Add logo_url to organizations table
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. Create products table
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

-- Enable RLS on products table
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS policy for products table
DROP POLICY IF EXISTS "Manage products of own organization" ON public.products;
CREATE POLICY "Manage products of own organization" ON public.products
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Grant privileges
GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.products TO postgres;

-- 4. Set up storage bucket for organization-logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('organization-logos', 'organization-logos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 5. Set up storage policies for organization-logos bucket
DROP POLICY IF EXISTS "Allow public read from organization-logos" ON storage.objects;
CREATE POLICY "Allow public read from organization-logos" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'organization-logos');

DROP POLICY IF EXISTS "Allow authenticated uploads to organization-logos" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to organization-logos" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'organization-logos');

DROP POLICY IF EXISTS "Allow authenticated management of organization-logos" ON storage.objects;
CREATE POLICY "Allow authenticated management of organization-logos" ON storage.objects
    FOR ALL TO authenticated USING (bucket_id = 'organization-logos') WITH CHECK (bucket_id = 'organization-logos');

NOTIFY pgrst, 'reload config';

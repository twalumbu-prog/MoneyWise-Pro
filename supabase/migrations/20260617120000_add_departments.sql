-- Add departments feature flag to organizations
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS use_departments BOOLEAN NOT NULL DEFAULT false;

-- Create departments table
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Manage departments of own organization" ON public.departments;
CREATE POLICY "Manage departments of own organization" ON public.departments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.departments TO service_role;
GRANT ALL ON public.departments TO postgres;

NOTIFY pgrst, 'reload config';

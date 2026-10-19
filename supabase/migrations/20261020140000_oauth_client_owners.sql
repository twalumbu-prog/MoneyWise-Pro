-- Self-service OAuth app registration: every app belongs to the organisation that
-- registered it, and shows as "Unverified" until a super-admin verifies it
-- (unverified apps are limited to the read scope).

ALTER TABLE public.oauth_clients
    ADD COLUMN IF NOT EXISTS owner_organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS created_by            UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS verified_at           TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_oauth_clients_owner ON public.oauth_clients (owner_organization_id);

NOTIFY pgrst, 'reload schema';

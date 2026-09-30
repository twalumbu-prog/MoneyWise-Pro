-- API keys for MoneyWise Pro developer access
-- Keys are stored as SHA-256 hashes; the raw key is shown only once at creation.
-- key_prefix stores the first 12 chars (e.g. "mwp_live_a1b2") for identification in the UI.

CREATE TABLE IF NOT EXISTS public.api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    key_hash        TEXT NOT NULL UNIQUE,  -- SHA-256 hex of the raw key
    key_prefix      TEXT NOT NULL,         -- first 16 chars of raw key for display
    scopes          TEXT[] NOT NULL DEFAULT ARRAY['read'],  -- ['read'] | ['read','write']
    last_used_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by hash on every request
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys (key_hash);

-- List all active keys for an org
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON public.api_keys (organization_id) WHERE revoked_at IS NULL;

-- RLS: only ADMIN members of the org can manage their org's keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org admins manage their api keys" ON public.api_keys;
CREATE POLICY "org admins manage their api keys"
  ON public.api_keys
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- Make PostgREST see the new table immediately
NOTIFY pgrst, 'reload schema';

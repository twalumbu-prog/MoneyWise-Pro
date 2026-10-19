-- OAuth 2.0 (authorization code + PKCE) so MoneyWise-connected apps can act on an
-- organisation's behalf without anyone copying API keys around.
-- Only the API (service role) touches these tables: RLS is enabled with no
-- policies, which denies anon/authenticated access outright.
-- Codes, access tokens, refresh tokens and client secrets are stored as SHA-256 hashes.

CREATE TABLE IF NOT EXISTS public.oauth_clients (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id          TEXT NOT NULL UNIQUE,            -- public identifier, e.g. mwc_ab12...
    name               TEXT NOT NULL,                   -- shown on the consent screen
    description        TEXT,
    logo_url           TEXT,
    redirect_uris      TEXT[] NOT NULL,                 -- exact-match allow-list
    allowed_scopes     TEXT[] NOT NULL DEFAULT ARRAY['read'],
    client_secret_hash TEXT,                            -- NULL = public client (SPA/mobile, PKCE only)
    disabled_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One grant per (app, organisation): what the admin approved.
CREATE TABLE IF NOT EXISTS public.oauth_grants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL REFERENCES public.oauth_clients(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,   -- admin who approved
    scopes          TEXT[] NOT NULL,                -- union of everything approved so far (drives auto-approve)
    last_used_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (client_id, organization_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_grants_org ON public.oauth_grants (organization_id) WHERE revoked_at IS NULL;

-- Short-lived, single-use authorization codes.
CREATE TABLE IF NOT EXISTS public.oauth_codes (
    code_hash      TEXT PRIMARY KEY,
    grant_id       UUID NOT NULL REFERENCES public.oauth_grants(id) ON DELETE CASCADE,
    redirect_uri   TEXT NOT NULL,
    code_challenge TEXT NOT NULL,                       -- PKCE S256 challenge
    scopes         TEXT[] NOT NULL,                     -- exactly what this request asked for
    expires_at     TIMESTAMPTZ NOT NULL,
    used_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON public.oauth_codes (expires_at);

-- Access/refresh token pairs. Refresh tokens rotate; replaced_at marks a used one
-- (presenting it again revokes the whole grant).
CREATE TABLE IF NOT EXISTS public.oauth_tokens (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_id           UUID NOT NULL REFERENCES public.oauth_grants(id) ON DELETE CASCADE,
    access_hash        TEXT NOT NULL UNIQUE,
    refresh_hash       TEXT NOT NULL UNIQUE,
    scopes             TEXT[] NOT NULL,
    access_expires_at  TIMESTAMPTZ NOT NULL,
    refresh_expires_at TIMESTAMPTZ NOT NULL,
    replaced_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_grant ON public.oauth_tokens (grant_id);

ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_grants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_codes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_tokens  ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

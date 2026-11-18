-- Lipila card payments. Each business (or individual) can connect its own Lipila wallet: its API key is stored encrypted, only the server
-- can read it, and card collections land in that wallet. Card payments in progress are tracked per reference so the webhook and the
-- status check find the right business, and therefore the right key. Additive only. Keep in step with the inline migration in
-- apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.org_gateway_credentials (
    organization_id           UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    lipila_api_key_enc        TEXT,                        -- the wallet's API key, encrypted (AES-256-GCM)
    lipila_webhook_secret_enc TEXT,                        -- that wallet's webhook signing secret, encrypted (empty when the shared one is used)
    lipila_env                TEXT NOT NULL DEFAULT 'sandbox' CHECK (lipila_env IN ('sandbox', 'production')),
    lipila_enabled            BOOLEAN NOT NULL DEFAULT FALSE,
    key_hint                  TEXT,                        -- the last characters of the key, so the owner can tell which one is saved
    updated_by                UUID,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lipila_card_sessions (
    reference       TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    net_amount      NUMERIC(14,2) NOT NULL CHECK (net_amount > 0),       -- what the business should receive
    charged_amount  NUMERIC(14,2) NOT NULL CHECK (charged_amount > 0),   -- what the customer's card is charged (net plus Lipila's fee)
    fee_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'ZMW',
    status          TEXT NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED', 'PROCESSING', 'SUCCESSFUL', 'FAILED')),
    redirect_url    TEXT,
    customer        JSONB,
    context         JSONB,                                               -- where the sale came from: payment link, quick link, store
    failure_reason  TEXT,
    record_error    TEXT,                                                -- set when Lipila confirmed the payment but we could not record it yet
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalized_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lipila_card_sessions_org ON public.lipila_card_sessions (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lipila_card_sessions_open ON public.lipila_card_sessions (status, created_at) WHERE status IN ('INITIATED', 'PROCESSING');

-- Only the server (service role) may read or write these: the key is a secret.
ALTER TABLE public.org_gateway_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lipila_card_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_gateway_credentials, public.lipila_card_sessions FROM anon, authenticated;
GRANT ALL ON public.org_gateway_credentials, public.lipila_card_sessions TO service_role;

NOTIFY pgrst, 'reload config';

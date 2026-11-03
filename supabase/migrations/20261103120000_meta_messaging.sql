-- Meta messaging integration (WhatsApp Cloud API, Facebook Messenger, Instagram DMs).
-- NOT applied automatically. Both tables are API/service-role only: RLS is ON with no policies,
-- so the anon/authenticated roles can read nothing directly (see rls-security-model).

CREATE TABLE IF NOT EXISTS public.messaging_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    connected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    platform TEXT NOT NULL CHECK (platform IN ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM')),
    -- WhatsApp: phone_number_id. Facebook: page id. Instagram: IG business account id.
    external_id TEXT NOT NULL,
    -- WhatsApp Business Account id (WABA) or Facebook Page id owning an Instagram account.
    parent_external_id TEXT,
    display_name TEXT,
    display_phone TEXT,
    -- AES-256-GCM ciphertext ("iv.tag.data" base64) — never stored in plaintext.
    access_token_enc TEXT,
    token_expires_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'DISCONNECTED', 'ERROR')),
    last_error TEXT,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live connection per external account; this is also how a webhook resolves to an org.
-- (Non-partial so the API can upsert on it; reconnecting after a disconnect reuses the row.)
CREATE UNIQUE INDEX IF NOT EXISTS messaging_connections_platform_external_key
    ON public.messaging_connections (platform, external_id);
CREATE INDEX IF NOT EXISTS messaging_connections_org_idx ON public.messaging_connections (organization_id);

CREATE TABLE IF NOT EXISTS public.messaging_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES public.messaging_connections(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM')),
    direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
    -- Meta's message id (wamid / mid); dedupes webhook retries.
    external_message_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,          -- sender's phone (WhatsApp) or PSID/IGSID
    contact_name TEXT,
    contact_phone TEXT,
    message_type TEXT NOT NULL DEFAULT 'text',
    body TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- AI intent (draft only; nothing here moves money or sends a reply)
    intent TEXT CHECK (intent IN ('SALE_INTENT', 'PAYMENT_CLAIM', 'ORDER_QUERY', 'OTHER')),
    intent_confidence NUMERIC(4, 3),
    intent_amount NUMERIC(14, 2),
    intent_summary TEXT,
    classified_at TIMESTAMPTZ,
    match_status TEXT NOT NULL DEFAULT 'NONE' CHECK (match_status IN ('NONE', 'SUGGESTED', 'CONFIRMED', 'DISMISSED')),
    matched_cashbook_entry_id UUID REFERENCES public.cashbook_entries(id) ON DELETE SET NULL,
    match_score NUMERIC(4, 3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connection_id, external_message_id)
);

CREATE INDEX IF NOT EXISTS messaging_messages_org_time_idx ON public.messaging_messages (organization_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS messaging_messages_org_intent_idx ON public.messaging_messages (organization_id, intent) WHERE intent IS NOT NULL;

ALTER TABLE public.messaging_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_messages ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: only the API (service role) touches these tables, scoped by organization_id in code.

-- Explicit permissions: backend service role only.
REVOKE ALL ON TABLE
    public.messaging_connections,
    public.messaging_messages
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.messaging_connections,
    public.messaging_messages
TO service_role;

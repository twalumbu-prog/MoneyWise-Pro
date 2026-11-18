-- Composio as a second way to connect Gmail / Facebook / Instagram (the first being our own OAuth: "DIRECT").
-- A COMPOSIO connection has no tokens in our database at all — Composio holds the OAuth grant and we call its tools with
-- the connected-account id, using the MoneyWise organisation id as Composio's "user id" (same convention as Kaizen OS).
-- Additive only: every existing row keeps working as DIRECT. NOT applied automatically.

ALTER TABLE public.email_connections
    ADD COLUMN IF NOT EXISTS auth_mode TEXT NOT NULL DEFAULT 'DIRECT' CHECK (auth_mode IN ('DIRECT', 'COMPOSIO')),
    ADD COLUMN IF NOT EXISTS composio_account_id TEXT;

ALTER TABLE public.messaging_connections
    ADD COLUMN IF NOT EXISTS auth_mode TEXT NOT NULL DEFAULT 'DIRECT' CHECK (auth_mode IN ('DIRECT', 'COMPOSIO')),
    ADD COLUMN IF NOT EXISTS composio_account_id TEXT,
    -- DIRECT messaging is pushed to our webhook; COMPOSIO messaging is polled, so it needs a sync cursor.
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS email_connections_composio_idx
    ON public.email_connections (last_synced_at NULLS FIRST) WHERE status = 'ACTIVE' AND auth_mode = 'COMPOSIO';
CREATE INDEX IF NOT EXISTS messaging_connections_composio_idx
    ON public.messaging_connections (last_synced_at NULLS FIRST) WHERE status = 'ACTIVE' AND auth_mode = 'COMPOSIO';

NOTIFY pgrst, 'reload config';

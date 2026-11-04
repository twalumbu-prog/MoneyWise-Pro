-- Gmail capture (AI Transaction Capture): a business connects its mailbox with "Sign in with Google"
-- (scope gmail.readonly) and receipts / invoices / payment emails are pulled in and classified.
-- NOT applied automatically. Both tables are API/service-role only: RLS is ON with no policies,
-- so the anon/authenticated roles can read nothing directly (see rls-security-model).
-- Nothing here writes to the ledger: classification fills suggestion columns only.

CREATE TABLE IF NOT EXISTS public.email_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    connected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'GMAIL' CHECK (provider IN ('GMAIL')),
    email_address TEXT NOT NULL,
    -- AES-256-GCM ciphertext ("iv.tag.data" base64, lib/tokenCrypto) — never stored in plaintext.
    refresh_token_enc TEXT,
    access_token_enc TEXT,
    access_token_expires_at TIMESTAMPTZ,
    -- Gmail historyId the next incremental sync starts from (users.history.list).
    last_history_id TEXT,
    last_synced_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'DISCONNECTED', 'ERROR')),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One org per mailbox (the API stores the address lower-cased). Plain column index so the API can upsert on it;
-- reconnecting reuses the row (the callback refuses when the row belongs to a different org and is still ACTIVE).
CREATE UNIQUE INDEX IF NOT EXISTS email_connections_provider_address_key
    ON public.email_connections (provider, email_address);
CREATE INDEX IF NOT EXISTS email_connections_org_idx ON public.email_connections (organization_id);
CREATE INDEX IF NOT EXISTS email_connections_active_idx ON public.email_connections (last_synced_at NULLS FIRST) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS public.inbound_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES public.email_connections(id) ON DELETE CASCADE,
    provider_message_id TEXT NOT NULL,     -- Gmail message id; dedupes re-syncs
    thread_id TEXT,
    from_address TEXT,
    to_address TEXT,
    subject TEXT,
    snippet TEXT,
    body_text TEXT,                        -- plain text, capped at 20k chars by the API
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    has_attachments BOOLEAN NOT NULL DEFAULT false,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{filename, mime_type, size, attachment_id}] — metadata only
    -- Deterministic pre-filter result: false = no money signal, never sent to the AI.
    prefilter_passed BOOLEAN NOT NULL DEFAULT false,
    -- AI classification (draft only; nothing here moves money or posts a journal)
    intent TEXT CHECK (intent IN ('RECEIPT', 'INVOICE', 'PAYMENT_CONFIRMATION', 'ORDER', 'OTHER')),
    direction TEXT CHECK (direction IN ('IN', 'OUT')),
    intent_amount NUMERIC(14, 2),
    intent_currency TEXT,
    counterparty TEXT,
    intent_confidence NUMERIC(4, 3),
    intent_summary TEXT,
    classified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connection_id, provider_message_id)
);

CREATE INDEX IF NOT EXISTS inbound_emails_org_time_idx ON public.inbound_emails (organization_id, received_at DESC);
CREATE INDEX IF NOT EXISTS inbound_emails_unclassified_idx ON public.inbound_emails (created_at)
    WHERE prefilter_passed AND classified_at IS NULL;

ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: only the API (service role) touches these tables, scoped by organization_id in code.

NOTIFY pgrst, 'reload config';

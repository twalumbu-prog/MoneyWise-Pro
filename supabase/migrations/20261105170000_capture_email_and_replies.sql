-- Phase 2: emails forwarded to a per-business address, and opt-in assisted replies.
-- Must run after 20261104120000_transaction_capture_phase0.sql. Service-role only: RLS on, no policies.

ALTER TABLE public.capture_settings ADD COLUMN IF NOT EXISTS email_alias TEXT;
ALTER TABLE public.capture_settings ADD COLUMN IF NOT EXISTS email_last_received_at TIMESTAMPTZ;
ALTER TABLE public.capture_settings ADD COLUMN IF NOT EXISTS replies_enabled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS capture_settings_email_alias_key
    ON public.capture_settings (email_alias) WHERE email_alias IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.inbound_emails (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    resend_id       TEXT NOT NULL,
    message_id      TEXT NOT NULL,      -- the email's Message-ID; webhook retries dedupe on this
    from_address    TEXT,
    subject         TEXT,
    text            TEXT,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT inbound_emails_org_message_key UNIQUE (organization_id, message_id)
);

ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inbound_emails FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inbound_emails TO service_role;

-- capture_jobs gains an EMAIL kind.
ALTER TABLE public.capture_jobs ADD COLUMN IF NOT EXISTS inbound_email_id UUID REFERENCES public.inbound_emails(id) ON DELETE CASCADE;
ALTER TABLE public.capture_jobs DROP CONSTRAINT IF EXISTS capture_jobs_kind_source_chk;
ALTER TABLE public.capture_jobs ADD CONSTRAINT capture_jobs_kind_source_chk CHECK (
    (kind = 'META_MESSAGE' AND message_id IS NOT NULL AND attachment_id IS NULL AND inbound_email_id IS NULL)
 OR (kind = 'ATTACHMENT'   AND attachment_id IS NOT NULL AND message_id IS NULL AND inbound_email_id IS NULL)
 OR (kind = 'EMAIL'        AND inbound_email_id IS NOT NULL AND message_id IS NULL AND attachment_id IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS capture_jobs_inbound_email_key
    ON public.capture_jobs (inbound_email_id) WHERE inbound_email_id IS NOT NULL;

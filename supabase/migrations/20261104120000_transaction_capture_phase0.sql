-- AI Transaction Capture â€” Phase 0 (shared capture queue, receipt upload, MoMo mirror).
-- Every table here is service-role only: RLS ON, NO policies, anon/authenticated revoked.
-- The API scopes every query by the organization_id of the authenticated session.

-- 1. Per-org settings = feature flag + kill switch. No row = disabled. ------------------------------
CREATE TABLE IF NOT EXISTS public.capture_settings (
    organization_id   UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    enabled           BOOLEAN NOT NULL DEFAULT FALSE,
    auto_post_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    auto_post_limit   NUMERIC(14, 2) NOT NULL DEFAULT 2000 CHECK (auto_post_limit >= 0),
    daily_ai_budget   INTEGER NOT NULL DEFAULT 500 CHECK (daily_ai_budget >= 0),
    updated_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Stored evidence files (private bucket). ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.capture_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    uploaded_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
    source_table    TEXT NOT NULL DEFAULT 'UPLOAD' CHECK (source_table IN ('UPLOAD', 'messaging_messages', 'inbound_emails')),
    source_id       UUID,
    storage_path    TEXT NOT NULL,
    mime            TEXT NOT NULL,
    size_bytes      INTEGER,
    sha256          TEXT NOT NULL,
    ocr_json        JSONB,
    ocr_at          TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Identical files are stored and OCR'd once per org.
    CONSTRAINT capture_attachments_org_sha_key UNIQUE (organization_id, sha256)
);

-- 3. The review queue: one proposed transaction per row. ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.transaction_captures (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    source                    TEXT NOT NULL CHECK (source IN ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'EMAIL', 'RECEIPT_UPLOAD', 'MOMO_SMS')),
    source_ids                UUID[] NOT NULL DEFAULT '{}',
    dedupe_key                TEXT NOT NULL,
    created_by                UUID REFERENCES public.users(id) ON DELETE SET NULL,
    momo_capture_id           UUID REFERENCES public.momo_captures(id) ON DELETE SET NULL,

    -- Extracted
    direction                 TEXT CHECK (direction IN ('IN', 'OUT')),
    amount                    NUMERIC(14, 2) CHECK (amount IS NULL OR amount > 0),
    currency                  TEXT,
    zmw_amount                NUMERIC(14, 2) CHECK (zmw_amount IS NULL OR zmw_amount > 0),
    occurred_on               DATE,
    occurred_at               TIMESTAMPTZ,
    counterparty_name         TEXT,
    counterparty_phone        TEXT,
    line_items                JSONB NOT NULL DEFAULT '[]',
    payment_method            TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (payment_method IN ('LENCO', 'CASH', 'MOMO_PERSONAL', 'OTHER_BANK', 'CREDIT', 'UNKNOWN')),
    evidence_summary          TEXT,

    -- AI / extraction
    intent                    TEXT CHECK (intent IN ('SALE', 'PURCHASE', 'PAYMENT_PROOF', 'ORDER_ONLY', 'NOT_TRANSACTION')),
    confidence                NUMERIC(4, 3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    model                     TEXT,
    reasoning                 TEXT,
    deterministic             BOOLEAN NOT NULL DEFAULT FALSE,   -- amount came from a deterministic parser, not a model
    ai_calls                  SMALLINT NOT NULL DEFAULT 0,
    flags                     TEXT[] NOT NULL DEFAULT '{}',
    suggested_account_id      UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    suggested_wallet_id       UUID REFERENCES public.external_wallets(id) ON DELETE SET NULL,
    suggested_crm_contact_id  UUID,

    -- A customer's say-so is never cash: CLAIMED until a ledger movement or provider SMS backs it.
    claim_state               TEXT NOT NULL DEFAULT 'CLAIMED' CHECK (claim_state IN ('CLAIMED', 'CORROBORATED')),

    -- Matching
    match_type                TEXT NOT NULL DEFAULT 'NONE' CHECK (match_type IN ('NONE', 'LENCO_ENTRY', 'EXISTING_CAPTURE', 'MOMO_CAPTURE', 'INVOICE')),
    matched_cashbook_entry_id UUID REFERENCES public.cashbook_entries(id) ON DELETE SET NULL,
    matched_invoice_id        UUID,
    merged_into_id            UUID REFERENCES public.transaction_captures(id) ON DELETE SET NULL,
    match_score               NUMERIC(4, 3),
    match_candidates          JSONB NOT NULL DEFAULT '[]',
    last_matched_at           TIMESTAMPTZ,

    -- Lifecycle (POSTING = transient lock while approve/undo runs)
    status                    TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'NEEDS_REVIEW', 'POSTING', 'APPROVED', 'AUTO_POSTED', 'MERGED', 'DISMISSED', 'FAILED')),
    cashbook_entry_id         UUID REFERENCES public.cashbook_entries(id) ON DELETE SET NULL,
    post_seq                  INTEGER NOT NULL DEFAULT 0,       -- bumps on undo so a re-approve gets a fresh reference
    voided_entry_ids          UUID[] NOT NULL DEFAULT '{}',
    posted_at                 TIMESTAMPTZ,
    reviewed_by               UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at               TIMESTAMPTZ,
    edits                     JSONB,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT transaction_captures_org_dedupe_key UNIQUE (organization_id, dedupe_key)
);

-- One capture per ledger entry, in both roles (booked by it, or matched to it).
CREATE UNIQUE INDEX IF NOT EXISTS transaction_captures_cashbook_entry_key
    ON public.transaction_captures (cashbook_entry_id) WHERE cashbook_entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transaction_captures_matched_entry_key
    ON public.transaction_captures (matched_cashbook_entry_id)
    WHERE matched_cashbook_entry_id IS NOT NULL AND status NOT IN ('DISMISSED', 'FAILED');
CREATE UNIQUE INDEX IF NOT EXISTS transaction_captures_momo_key
    ON public.transaction_captures (momo_capture_id) WHERE momo_capture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transaction_captures_org_status_idx
    ON public.transaction_captures (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS transaction_captures_rematch_idx
    ON public.transaction_captures (last_matched_at NULLS FIRST)
    WHERE status = 'NEEDS_REVIEW' AND match_type = 'NONE';
CREATE INDEX IF NOT EXISTS transaction_captures_source_ids_idx
    ON public.transaction_captures USING GIN (source_ids);

-- 4. Generalise the existing job queue to attachment jobs. -------------------------------------------
ALTER TABLE public.capture_jobs ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'META_MESSAGE';
ALTER TABLE public.capture_jobs ADD COLUMN IF NOT EXISTS attachment_id UUID REFERENCES public.capture_attachments(id) ON DELETE CASCADE;
ALTER TABLE public.capture_jobs ALTER COLUMN message_id DROP NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'capture_jobs_kind_source_chk') THEN
        ALTER TABLE public.capture_jobs ADD CONSTRAINT capture_jobs_kind_source_chk CHECK (
            (kind = 'META_MESSAGE' AND message_id IS NOT NULL AND attachment_id IS NULL)
         OR (kind = 'ATTACHMENT'   AND attachment_id IS NOT NULL AND message_id IS NULL));
    END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS capture_jobs_attachment_key
    ON public.capture_jobs (attachment_id) WHERE attachment_id IS NOT NULL;

-- claim_capture_jobs now also returns kind + attachment_id (return type change needs a DROP).
DROP FUNCTION IF EXISTS public.claim_capture_jobs(INTEGER);
CREATE FUNCTION public.claim_capture_jobs(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (job_id UUID, kind TEXT, message_id UUID, attachment_id UUID, organization_id UUID, attempts INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 10);
BEGIN
    WITH expired AS (
        UPDATE public.capture_jobs AS job
        SET status = CASE WHEN job.attempts >= 3 THEN 'FAILED' ELSE 'PENDING' END,
            available_at = CASE
                WHEN job.attempts >= 3 THEN job.available_at
                WHEN job.attempts = 1 THEN now() + interval '30 seconds'
                WHEN job.attempts = 2 THEN now() + interval '120 seconds'
                ELSE now() + interval '300 seconds'
            END,
            locked_at = NULL,
            last_error = 'Worker lease expired before job completion',
            updated_at = now()
        WHERE job.status = 'PROCESSING' AND job.locked_at < now() - interval '2 minutes'
        RETURNING job.id, job.kind, job.message_id, job.attachment_id, job.organization_id, job.attempts, job.status, job.last_error
    )
    INSERT INTO public.audit_logs (entity_type, entity_id, action, changes)
    SELECT 'CAPTURE_JOB', expired.organization_id, 'CAPTURE_JOB_FAILED',
           jsonb_build_object('job_id', expired.id, 'kind', expired.kind, 'message_id', expired.message_id,
                              'attachment_id', expired.attachment_id, 'attempts', expired.attempts,
                              'error', expired.last_error, 'reason', 'Processing lease expired after maximum attempts')
    FROM expired WHERE expired.status = 'FAILED';

    RETURN QUERY
    WITH candidates AS (
        SELECT job.id FROM public.capture_jobs AS job
        WHERE job.status = 'PENDING' AND job.available_at <= now() AND job.attempts < 3
        ORDER BY job.available_at, job.created_at
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.capture_jobs AS job
    SET status = 'PROCESSING', attempts = job.attempts + 1, locked_at = now(), updated_at = now()
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING job.id, job.kind, job.message_id, job.attachment_id, job.organization_id, job.attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_capture_jobs(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_capture_jobs(INTEGER) TO service_role;


-- 4b. Defer jobs when transaction capture is disabled for an organisation.
-- This does not consume an attempt or count as a processing failure.
CREATE OR REPLACE FUNCTION public.defer_capture_job(
    p_job_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE public.capture_jobs
    SET
        status = 'PENDING',
        available_at = now() + interval '5 minutes',
        locked_at = NULL,
        updated_at = now()
    WHERE id = p_job_id
      AND status = 'PROCESSING';

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    RETURN v_updated = 1;
END;
$$;

-- Only the API service role may defer capture jobs.
REVOKE ALL ON FUNCTION public.defer_capture_job(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.defer_capture_job(UUID)
TO service_role;


-- 5. Private bucket for evidence (no storage policies â†’ service role only; URLs are signed for 10 min). --
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('capture-attachments', 'capture-attachments', FALSE, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 6. Isolation. ---------------------------------------------------------------------------------------
ALTER TABLE public.capture_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_captures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.capture_settings, public.capture_attachments, public.transaction_captures FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.capture_settings, public.capture_attachments, public.transaction_captures TO service_role;

-- 7. Reuse the existing Meta capture worker registration for all capture sources. ----------------
INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note)
VALUES ('meta-capture-worker', '/cron/capture-worker', '* * * * *', 30000, TRUE, 60, TRUE, 'Transaction capture queue: attachments, Meta messages, re-matching')
ON CONFLICT (job) DO UPDATE SET
    path = EXCLUDED.path,
    schedule = EXCLUDED.schedule,
    timeout_ms = EXCLUDED.timeout_ms,
    skip_if_running = EXCLUDED.skip_if_running,
    expected_interval_seconds = EXCLUDED.expected_interval_seconds,
    active = EXCLUDED.active,
    note = EXCLUDED.note;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
        PERFORM cron.schedule('internal:meta-capture-worker', '* * * * *', 'SELECT public.internal_cron_call(''meta-capture-worker'')');
    END IF;
END $$;

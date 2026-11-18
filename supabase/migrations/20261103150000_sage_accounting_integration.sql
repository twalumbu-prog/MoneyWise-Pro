-- =============================================================================
-- Sage Accounting (Sage Business Cloud Accounting / "Pastel Online", Africa
-- region API v2.0.0) — Phase 1
-- =============================================================================
-- The connection itself lives in `integrations` (provider = 'SAGE_ACCOUNTING'):
--   realm_id     → Sage CompanyId
--   access_token → encrypted "username:password" (Sage's Africa API uses Basic auth)
--   config       → { username, companyName }
-- This migration only adds the account mapping and the per-journal push log.
-- Additive and idempotent.
-- =============================================================================

-- MoneyWise GL account → Sage account (Sage account IDs are integers; stored as text).
ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS sage_account_id   TEXT,
    ADD COLUMN IF NOT EXISTS sage_account_name TEXT;

-- One row per MoneyWise journal source pushed to Sage. Keyed on the journal's
-- source (journals are deleted + re-inserted on every re-post, so the
-- journal_entries.id is not stable). lines_hash detects a changed re-post: the
-- old Sage entries are deleted and the new lines pushed.
CREATE TABLE IF NOT EXISTS public.sage_journal_sync (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    source_key        text NOT NULL,             -- "<source_type>:<source_id>" or "JE:<journal id>"
    journal_entry_id  uuid,                      -- last pushed journal (informational)
    lines_hash        text,
    sage_entry_ids    jsonb NOT NULL DEFAULT '[]'::jsonb,
    status            text NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','SUCCESS','FAILED','SKIPPED')),
    error             text,
    synced_at         timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_sage_journal_sync_org_status
    ON public.sage_journal_sync (organization_id, status);

-- API/service-role only, like the rest of the integration tables.
ALTER TABLE public.sage_journal_sync ENABLE ROW LEVEL SECURITY;

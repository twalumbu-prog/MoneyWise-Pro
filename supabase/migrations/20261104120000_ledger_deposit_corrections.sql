-- DRAFT — NOT APPLIED. Review, then apply from the SQL editor (this repo applies migrations by hand).
--
-- Supports correcting an external wallet's ledger against its bank statement (first use: Twalumbu's Zanaco wallet).
-- Purely additive: no existing column, row or constraint is changed or removed.
--
--   1. bank_statement_lines.external_id / agent  - the id a caller sends was only ever hashed into line_hash and thrown away, so a
--      statement line could never be found again by it. Stored now, unique per wallet when present.
--   2. cashbook_entries.recorded_date            - the date Master Fees (or whoever) originally recorded. When an entry is re-dated to
--      the bank's deposit date, `date` (which drives the journal date, reports and running balance) takes the corrected value and the
--      original is kept here. NULL = never re-dated.
--   3. cashbook_entries.verification_status / verification_note / held_amount - 'UNVERIFIED' parks an entry that has no bank deposit
--      behind it. Following the repo's neutralise-don't-delete convention the row's debit is zeroed (so the running balance, the journal,
--      the Guardian and every report already treat it as inert) and the original amount is kept in held_amount; restoring puts it back.
--      It is a separate flag, NOT a new `status` value, so nothing that reads `status` changes behaviour.
--   4. cashbook_entries.qb_resync_required       - set on an ACCOUNTED entry whose books-relevant fields changed after it reached
--      QuickBooks; nothing posts or edits QuickBooks because of it, it only tells the later QuickBooks step what to fix.
--   5. ledger_entry_statement_lines              - many-to-many link between ledger entries and statement lines (one deposit can cover
--      several entries). The deposit's reference / narration / agent are read through it, never copied onto the entry.
--   6. ledger_corrections                        - one audit row per field change (entry, field, old, new, action code, source, actor,
--      when), reversible, idempotent on (entry, field, action_code, source_ref).
--   7. ledger_correction_queue                   - the review queue: MEDIUM re-dates and every Unverified entry with its resolution.
--
-- All new tables are service-role only (RLS on, no policies), like the rest of the ledger tables.

-- 1 ── statement lines keep the caller's id ───────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.bank_statement_lines
    ADD COLUMN IF NOT EXISTS external_id TEXT,
    ADD COLUMN IF NOT EXISTS agent       TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bank_statement_lines_external_id
    ON public.bank_statement_lines (external_wallet_id, external_id)
    WHERE external_id IS NOT NULL;

-- 2–4 ── ledger entry fields ──────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.cashbook_entries
    ADD COLUMN IF NOT EXISTS recorded_date       DATE,
    ADD COLUMN IF NOT EXISTS verification_status TEXT,
    ADD COLUMN IF NOT EXISTS verification_note   TEXT,
    ADD COLUMN IF NOT EXISTS held_amount         NUMERIC(15, 2),
    ADD COLUMN IF NOT EXISTS qb_resync_required  BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN
    ALTER TABLE public.cashbook_entries
        ADD CONSTRAINT cashbook_entries_verification_status_chk CHECK (verification_status IS NULL OR verification_status IN ('UNVERIFIED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cashbook_entries_unverified
    ON public.cashbook_entries (organization_id) WHERE verification_status = 'UNVERIFIED';
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_qb_resync
    ON public.cashbook_entries (organization_id) WHERE qb_resync_required;

-- 5 ── entry ↔ statement line link ──────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ledger_entry_statement_lines (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    ledger_entry_id   UUID NOT NULL REFERENCES public.cashbook_entries(id) ON DELETE CASCADE,
    statement_line_id UUID NOT NULL REFERENCES public.bank_statement_lines(id) ON DELETE CASCADE,
    match_confidence  TEXT NOT NULL CHECK (match_confidence IN ('HIGH', 'MEDIUM', 'MANUAL')),
    matched_by        TEXT NOT NULL,                       -- 'kaizen-worklist-2026-11-04', or a user id
    matched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ledger_entry_id, statement_line_id)
);
CREATE INDEX IF NOT EXISTS idx_lesl_statement_line ON public.ledger_entry_statement_lines (statement_line_id);
CREATE INDEX IF NOT EXISTS idx_lesl_org ON public.ledger_entry_statement_lines (organization_id);

-- 6 ── correction audit trail ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ledger_corrections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    entry_id        UUID NOT NULL,                          -- deliberately NO foreign key: the audit trail must outlive an entry that Master Fees later voids and removes
    field           TEXT NOT NULL,                          -- 'date', 'verification_status', 'account_type', ...
    old_value       TEXT,
    new_value       TEXT,
    action_code     TEXT NOT NULL,                          -- FIX_DATE | UNVERIFIED | MOVE_WALLET | VOID | ...
    reason          TEXT,
    source_ref      TEXT NOT NULL,                          -- the worklist key: external_reference / external_id
    actor           TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reverted_at     TIMESTAMPTZ,
    reverted_by     TEXT,
    UNIQUE (entry_id, field, action_code, source_ref)       -- running an apply twice changes nothing the second time
);
CREATE INDEX IF NOT EXISTS idx_ledger_corrections_org_time ON public.ledger_corrections (organization_id, created_at DESC);

-- 7 ── review queue ─────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ledger_correction_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    entry_id        UUID NOT NULL REFERENCES public.cashbook_entries(id) ON DELETE CASCADE,
    action_code     TEXT NOT NULL,                          -- FIX_DATE_MEDIUM | NO_DEPOSIT_FOUND | MW_ONLY_NOT_ZANACO
    proposed        JSONB NOT NULL DEFAULT '{}'::jsonb,     -- e.g. {"new_date":"2026-05-04","bank_external_ids":[...]}
    notes           TEXT,
    status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED')),
    resolution      TEXT CHECK (resolution IS NULL OR resolution IN ('DEPOSIT_FOUND', 'OTHER_ACCOUNT', 'DUPLICATE', 'NOT_RECEIVED')),
    resolution_note TEXT,                                   -- surviving ref for a duplicate, target wallet for another account
    decided_by      TEXT,
    decided_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entry_id, action_code)
);
CREATE INDEX IF NOT EXISTS idx_lcq_org_status ON public.ledger_correction_queue (organization_id, status);

ALTER TABLE public.ledger_entry_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_corrections           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_correction_queue      ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (only before any data is written to the new objects):
--   DROP TABLE IF EXISTS public.ledger_correction_queue, public.ledger_corrections, public.ledger_entry_statement_lines;
--   ALTER TABLE public.cashbook_entries DROP COLUMN IF EXISTS recorded_date, DROP COLUMN IF EXISTS verification_status,
--       DROP COLUMN IF EXISTS verification_note, DROP COLUMN IF EXISTS held_amount, DROP COLUMN IF EXISTS qb_resync_required;
--   DROP INDEX IF EXISTS public.uniq_bank_statement_lines_external_id;
--   ALTER TABLE public.bank_statement_lines DROP COLUMN IF EXISTS external_id, DROP COLUMN IF EXISTS agent;

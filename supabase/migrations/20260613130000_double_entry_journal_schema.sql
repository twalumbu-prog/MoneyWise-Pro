-- =============================================================================
-- Double-Entry General Ledger — Phase 1: Schema
-- =============================================================================
-- Introduces a true double-entry general ledger that sits alongside the existing
-- single-sided `cashbook_entries` cash/wallet book. Every economic event will post
-- a balanced journal entry (Sum debit = Sum credit) so the Net Worth view can present
-- a balance sheet that always satisfies Assets = Liabilities + Equity.
--
-- This migration is ADDITIVE and idempotent: it only creates the GL tables, their
-- integrity constraints and indexes. No posting logic and no data changes here —
-- the posting engine (fn/service) and historical backfill land in later phases.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- journal_entries — the header for one balanced double-entry transaction
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    entry_date        date NOT NULL,
    description       text,
    reference_number  text,
    -- Provenance of this entry, so it can be re-derived idempotently from its source
    -- document. CASHBOOK = generated from a cashbook_entries row (the common case).
    source_type       text NOT NULL DEFAULT 'CASHBOOK'
                          CHECK (source_type IN ('CASHBOOK','LINE_ITEMS','OPENING','MANUAL','RECLASS')),
    source_id         uuid,
    created_by        uuid REFERENCES public.users(id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One journal entry per source document → posting is idempotent (delete + re-insert
-- by source key on every re-post / reclassification / backfill run).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_journal_entry_source
    ON public.journal_entries (organization_id, source_type, source_id)
    WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date
    ON public.journal_entries (organization_id, entry_date);

-- ---------------------------------------------------------------------------
-- journal_lines — the individual debit/credit postings of an entry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_lines (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id  uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id        uuid NOT NULL REFERENCES public.accounts(id),
    debit             numeric NOT NULL DEFAULT 0,
    credit            numeric NOT NULL DEFAULT 0,
    description       text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    -- A line moves money in exactly one direction.
    CONSTRAINT journal_lines_one_sided
        CHECK (debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0))
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry
    ON public.journal_lines (journal_entry_id);

-- The trial balance is read by (org via the parent entry, account); index the join keys.
CREATE INDEX IF NOT EXISTS idx_journal_lines_account
    ON public.journal_lines (account_id);

-- ---------------------------------------------------------------------------
-- Balanced-entry invariant: Sum(debit) = Sum(credit) per journal entry.
-- Enforced with a DEFERRED constraint trigger so multi-line entries can be built
-- up within a transaction and are only validated at COMMIT, once all lines exist.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_journal_entry_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_entry_id   uuid;
    v_exists     boolean;
    v_debit      numeric;
    v_credit     numeric;
    v_n          integer;
BEGIN
    v_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);

    -- If the parent entry is gone (e.g. cascade delete of the whole entry), there is
    -- nothing to balance — skip.
    SELECT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_entry_id) INTO v_exists;
    IF NOT v_exists THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
      INTO v_debit, v_credit, v_n
      FROM public.journal_lines
     WHERE journal_entry_id = v_entry_id;

    -- An entry that still exists must have lines that balance within rounding tolerance.
    IF v_n = 0 THEN
        RAISE EXCEPTION 'Journal entry % has no lines', v_entry_id;
    END IF;

    IF abs(v_debit - v_credit) > 0.005 THEN
        RAISE EXCEPTION 'Journal entry % is unbalanced: debit % <> credit %',
            v_entry_id, v_debit, v_credit;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_balanced ON public.journal_lines;
CREATE CONSTRAINT TRIGGER trg_journal_lines_balanced
    AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.assert_journal_entry_balanced();

-- ---------------------------------------------------------------------------
-- keep updated_at fresh on the header
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_journal_entry_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_touch ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_touch
    BEFORE UPDATE ON public.journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_journal_entry_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — mirror the access model of cashbook_entries (service role writes; the
-- app reads scoped to the user's organization). Policies are intentionally
-- minimal here; tighten alongside the reporting rewrite if needed.
-- ---------------------------------------------------------------------------
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines   ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.journal_entries IS
    'Double-entry GL header. One balanced entry per source document (see source_type/source_id).';
COMMENT ON TABLE public.journal_lines IS
    'Double-entry GL postings. Per entry, SUM(debit)=SUM(credit) (enforced by trg_journal_lines_balanced).';

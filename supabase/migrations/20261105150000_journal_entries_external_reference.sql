-- Manual journal entries (source_type = 'MANUAL', already allowed by journal_entries_source_type_check).
--
-- 1. external_reference: the free-text reference the user types on a journal (invoice no., memo ref…). The system journal
--    number (JV-<year>-<n>) lives in reference_number. The API falls back to appending the reference to the description
--    until this is applied, so applying it is optional but recommended.
-- 2. A unique journal number per organization for manual journals, so two concurrent posters can never get the same JV number
--    (the API retries with the next number on a collision). Partial index → no effect on any other journal.
-- Safe to re-run; adds no data.

ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS external_reference text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_manual_number
    ON public.journal_entries (organization_id, reference_number)
    WHERE source_type = 'MANUAL' AND reference_number IS NOT NULL;

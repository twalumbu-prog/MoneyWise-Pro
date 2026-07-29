-- Allow the Master Fees integration to post its own GL journals.
--
-- journal_entries.source_type had a fixed CHECK list (CASHBOOK, LINE_ITEMS, OPENING,
-- MANUAL, RECLASS) from the original double-entry schema (20260613130000). The
-- Master Fees integration (apps/api/src/services/masterfees.service.ts) posts
-- invoice/payment journals directly to the GL with source_type='MASTERFEES' — it
-- has no cashbook_entries row backing it, unlike every other posting path.
ALTER TABLE public.journal_entries
    DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;

ALTER TABLE public.journal_entries
    ADD CONSTRAINT journal_entries_source_type_check
    CHECK (source_type IN ('CASHBOOK','LINE_ITEMS','OPENING','MANUAL','RECLASS','MASTERFEES'));

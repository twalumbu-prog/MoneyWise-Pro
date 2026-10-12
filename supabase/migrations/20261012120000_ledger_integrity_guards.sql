-- Ledger integrity guards (2026-10-12).
--
-- Problem: the general ledger (journal_entries/journal_lines) is derived from cashbook_entries, but two things could
-- leave it out of step with the wallets and make Reports/Net Worth wrong:
--   1. a cashbook entry deleted (e.g. by a reconciliation clean-up) left its journal entry behind -> a "ghost" posting
--      that inflated the wallet in the books (Blue Opus Software was K21.7k too high because of 121 of them);
--   2. a cashbook entry zeroed out ("neutralised") after it had been posted kept its old journal (Stephen's Workspace
--      showed K921 in the wallet account against K860 in the wallet).
-- The application now repairs both (apps/api ledgerIntegrity.service.ts: audit + heal-on-read). These guards make the
-- database enforce it too, so no script run from the SQL editor can reintroduce the problem.
-- Safe to re-run.

-- 1. Deleting a cashbook entry deletes the journal entry it produced.
CREATE OR REPLACE FUNCTION public.delete_journal_for_cashbook_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM public.journal_lines
     WHERE journal_entry_id IN (SELECT id FROM public.journal_entries WHERE source_type = 'CASHBOOK' AND source_id = OLD.id);
    DELETE FROM public.journal_entries WHERE source_type = 'CASHBOOK' AND source_id = OLD.id;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cashbook_delete_journal ON public.cashbook_entries;
CREATE TRIGGER trg_cashbook_delete_journal
    AFTER DELETE ON public.cashbook_entries
    FOR EACH ROW EXECUTE FUNCTION public.delete_journal_for_cashbook_entry();

-- 2. Zeroing out / un-completing an entry removes its posting immediately.
CREATE OR REPLACE FUNCTION public.drop_journal_when_entry_not_posted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'PENDING' OR abs(COALESCE(NEW.debit, 0) - COALESCE(NEW.credit, 0)) <= 0.005 THEN
        DELETE FROM public.journal_lines
         WHERE journal_entry_id IN (SELECT id FROM public.journal_entries WHERE source_type = 'CASHBOOK' AND source_id = NEW.id);
        DELETE FROM public.journal_entries WHERE source_type = 'CASHBOOK' AND source_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cashbook_update_drop_journal ON public.cashbook_entries;
CREATE TRIGGER trg_cashbook_update_drop_journal
    AFTER UPDATE OF debit, credit, status ON public.cashbook_entries
    FOR EACH ROW EXECUTE FUNCTION public.drop_journal_when_entry_not_posted();

-- 3. One-off: remove ghost postings that already exist.
DELETE FROM public.journal_lines
 WHERE journal_entry_id IN (
     SELECT je.id FROM public.journal_entries je
      WHERE je.source_type = 'CASHBOOK'
        AND NOT EXISTS (SELECT 1 FROM public.cashbook_entries ce WHERE ce.id = je.source_id));
DELETE FROM public.journal_entries je
 WHERE je.source_type = 'CASHBOOK'
   AND NOT EXISTS (SELECT 1 FROM public.cashbook_entries ce WHERE ce.id = je.source_id);

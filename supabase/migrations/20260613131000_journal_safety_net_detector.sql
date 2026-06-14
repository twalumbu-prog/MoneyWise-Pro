-- Hybrid safety net: returns cashbook entries that SHOULD have a balanced journal
-- entry but don't (e.g. written by raw scripts/direct SQL or where live posting failed).
-- A periodic sweep selects these and re-posts them via the ledger service.
CREATE OR REPLACE FUNCTION public.cashbook_entries_missing_journal(p_organization_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
AS $$
    SELECT ce.id
    FROM public.cashbook_entries ce
    WHERE ce.organization_id = p_organization_id
      AND ce.status <> 'PENDING'
      AND abs(COALESCE(ce.debit, 0) - COALESCE(ce.credit, 0)) > 0.005
      AND NOT EXISTS (
          SELECT 1 FROM public.journal_entries je
          WHERE je.source_type = 'CASHBOOK'
            AND je.source_id = ce.id
      );
$$;

COMMENT ON FUNCTION public.cashbook_entries_missing_journal(uuid) IS
    'Safety net: non-PENDING, non-zero cashbook entries lacking a GL journal entry, for the reconciliation sweep to re-post.';

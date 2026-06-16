-- Enhanced safety-net detector: cashbook entries whose GL journal is MISSING or STALE.
-- Stale = a requisition-linked entry whose line items were edited (recategorized, amount
-- changed, fee added) AFTER the journal was last posted. cashbook_entries has no
-- updated_at, so entry-level changes are covered by explicit live re-post hooks; this
-- catches the line-item mutation paths that aren't individually hooked.
CREATE OR REPLACE FUNCTION public.cashbook_entries_needing_repost(p_organization_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
AS $$
    -- Missing: posted-eligible entries with no journal entry at all.
    SELECT ce.id
    FROM public.cashbook_entries ce
    WHERE ce.organization_id = p_organization_id
      AND ce.status <> 'PENDING'
      AND abs(COALESCE(ce.debit, 0) - COALESCE(ce.credit, 0)) > 0.005
      AND NOT EXISTS (
          SELECT 1 FROM public.journal_entries je
          WHERE je.source_type = 'CASHBOOK' AND je.source_id = ce.id
      )

    UNION

    -- Stale: requisition-linked entries whose line items changed after the last post.
    SELECT ce.id
    FROM public.cashbook_entries ce
    JOIN public.journal_entries je
      ON je.source_type = 'CASHBOOK' AND je.source_id = ce.id
    WHERE ce.organization_id = p_organization_id
      AND ce.requisition_id IS NOT NULL
      AND EXISTS (
          SELECT 1 FROM public.line_items li
          WHERE li.requisition_id = ce.requisition_id
            AND li.updated_at > je.created_at
      );
$$;

COMMENT ON FUNCTION public.cashbook_entries_needing_repost(uuid) IS
    'Safety net: cashbook entries whose GL journal is missing or stale (line items edited since last post), for the reconciliation sweep to re-post.';

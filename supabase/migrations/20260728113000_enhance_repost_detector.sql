-- Enhance the reconciliation safety net to detect out-of-sync edits and orphaned journal headers.

CREATE OR REPLACE FUNCTION public.cashbook_entries_needing_repost(p_organization_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
AS $$
    SELECT id FROM (
        -- Missing: posted-eligible entries with no journal entry at all.
        SELECT ce.id, ce.date
        FROM public.cashbook_entries ce
        WHERE ce.organization_id = p_organization_id
          AND ce.status <> 'PENDING'
          AND abs(COALESCE(ce.debit, 0) - COALESCE(ce.credit, 0)) > 0.005
          AND NOT EXISTS (
              SELECT 1 FROM public.journal_entries je
              WHERE je.source_type = 'CASHBOOK' AND je.source_id = ce.id
          )

        UNION

        -- Orphaned: posted-eligible entries with a journal header but NO lines
        SELECT ce.id, ce.date
        FROM public.cashbook_entries ce
        JOIN public.journal_entries je
          ON je.source_type = 'CASHBOOK' AND je.source_id = ce.id
        WHERE ce.organization_id = p_organization_id
          AND ce.status <> 'PENDING'
          AND abs(COALESCE(ce.debit, 0) - COALESCE(ce.credit, 0)) > 0.005
          AND NOT EXISTS (
              SELECT 1 FROM public.journal_lines jl
              WHERE jl.journal_entry_id = je.id
          )

        UNION

        -- Out-of-sync: cashbook entries modified AFTER their journal entry was created (catching manual edits)
        SELECT ce.id, ce.date
        FROM public.cashbook_entries ce
        JOIN public.journal_entries je
          ON je.source_type = 'CASHBOOK' AND je.source_id = ce.id
        WHERE ce.organization_id = p_organization_id
          AND ce.status <> 'PENDING'
          AND ce.updated_at > je.created_at

        UNION

        -- Stale: requisition-linked entries whose line items changed after the last post.
        SELECT ce.id, ce.date
        FROM public.cashbook_entries ce
        JOIN public.journal_entries je
          ON je.source_type = 'CASHBOOK' AND je.source_id = ce.id
        WHERE ce.organization_id = p_organization_id
          AND ce.requisition_id IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM public.line_items li
              WHERE li.requisition_id = ce.requisition_id
                AND li.updated_at > je.created_at
          )
    ) needing_repost
    ORDER BY date ASC
    LIMIT 50;
$$;

COMMENT ON FUNCTION public.cashbook_entries_needing_repost(uuid) IS
    'Safety net: cashbook entries whose GL journal is missing, empty (orphaned header), or stale (modified or line items edited since last post). Capped at 50 rows/call, oldest first.';


CREATE OR REPLACE FUNCTION public.cashbook_entries_missing_journal(p_organization_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
AS $$
    -- Same logic as needing_repost but without the 50 limit and order by, 
    -- used by isOrgFullyPosted to determine if ANY gaps exist in the org.
    SELECT id FROM (
        -- Missing
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

        -- Orphaned
        SELECT ce.id
        FROM public.cashbook_entries ce
        JOIN public.journal_entries je
          ON je.source_type = 'CASHBOOK' AND je.source_id = ce.id
        WHERE ce.organization_id = p_organization_id
          AND ce.status <> 'PENDING'
          AND abs(COALESCE(ce.debit, 0) - COALESCE(ce.credit, 0)) > 0.005
          AND NOT EXISTS (
              SELECT 1 FROM public.journal_lines jl
              WHERE jl.journal_entry_id = je.id
          )

        UNION

        -- Out-of-sync
        SELECT ce.id
        FROM public.cashbook_entries ce
        JOIN public.journal_entries je
          ON je.source_type = 'CASHBOOK' AND je.source_id = ce.id
        WHERE ce.organization_id = p_organization_id
          AND ce.status <> 'PENDING'
          AND ce.updated_at > je.created_at

        UNION

        -- Stale (requisition linked)
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
          )
    ) missing_journals;
$$;

COMMENT ON FUNCTION public.cashbook_entries_missing_journal(uuid) IS
    'Safety net: determines if an org has ANY cashbook entries whose GL journal is missing, empty, or stale.';

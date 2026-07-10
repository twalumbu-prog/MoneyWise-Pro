-- Bound the reconciliation-sweep detector's blast radius per call.
--
-- cashbook_entries_needing_repost() had no LIMIT. For an org whose chart of
-- accounts is missing both a Main Wallet and an Uncategorised Asset fallback
-- account, resolveCashAccount() in ledger.service.ts returns null forever for
-- every affected entry — so the /lenco/sync cron's reconciliation sweep
-- rediscovered and re-failed the SAME growing set of entries every 5 minutes,
-- with no bound on how much time that could burn in one invocation. Combined
-- with the app's 30s serverless maxDuration, this caused POST /lenco/sync to
-- 504 (2026-07-10). Capping the row count here, paired with an in-process
-- time-budget check in ledgerService.runSweep, bounds worst-case time
-- regardless of how many entries are structurally unrepostable.
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
    -- Oldest first: a permanently-broken entry (see above) sorts to the back
    -- once older rows get fixed, instead of head-of-line blocking everything
    -- newer behind it forever.
    ORDER BY date ASC
    LIMIT 50;
$$;

COMMENT ON FUNCTION public.cashbook_entries_needing_repost(uuid) IS
    'Safety net: cashbook entries whose GL journal is missing or stale (line items edited since last post), for the reconciliation sweep to re-post. Capped at 50 rows/call, oldest first.';

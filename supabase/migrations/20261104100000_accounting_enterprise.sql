-- Enterprise plan, and the one query the financial statements need: debits and credits per account over a date range.
-- Keep in step with the inline migration in apps/api/src/index.ts.

-- Enterprise is billed by agreement, so it carries no list price here. Accounting is the first feature that needs it.
INSERT INTO public.subscription_plans (id, name, price_zmw, max_members, features)
VALUES ('enterprise', 'Enterprise', 0, NULL, '{"team": true, "products": true, "payment_links": true, "accounting": true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.accounting_balances(p_org uuid, p_from date, p_to date)
RETURNS TABLE (account_id uuid, debit numeric, credit numeric)
LANGUAGE sql STABLE
AS $$
    SELECT l.account_id, COALESCE(SUM(l.debit), 0), COALESCE(SUM(l.credit), 0)
    FROM public.journal_lines l
    JOIN public.journal_entries e ON e.id = l.journal_entry_id
    WHERE e.organization_id = p_org
      AND (p_from IS NULL OR e.entry_date >= p_from)
      AND (p_to IS NULL OR e.entry_date <= p_to)
    GROUP BY l.account_id
$$;
REVOKE ALL ON FUNCTION public.accounting_balances(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_balances(uuid, date, date) TO service_role;

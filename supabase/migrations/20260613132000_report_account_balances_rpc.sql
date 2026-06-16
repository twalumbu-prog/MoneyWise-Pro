-- Trial balance for the reporting layer: per active account, the period [start,end]
-- and cumulative (<= end) debit/credit sums from the GL, plus a transaction count.
CREATE OR REPLACE FUNCTION public.report_account_balances(p_org uuid, p_start date, p_end date)
RETURNS TABLE (
    account_id        uuid,
    account_name      text,
    code              text,
    type              text,
    period_debit      numeric,
    period_credit     numeric,
    period_n          bigint,
    cumulative_debit  numeric,
    cumulative_credit numeric,
    cumulative_n      bigint
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        a.id,
        a.name,
        a.code,
        a.type,
        COALESCE(SUM(jl.debit)  FILTER (WHERE je.entry_date BETWEEN p_start AND p_end), 0),
        COALESCE(SUM(jl.credit) FILTER (WHERE je.entry_date BETWEEN p_start AND p_end), 0),
        COUNT(DISTINCT je.id)   FILTER (WHERE je.entry_date BETWEEN p_start AND p_end),
        COALESCE(SUM(jl.debit)  FILTER (WHERE je.entry_date <= p_end), 0),
        COALESCE(SUM(jl.credit) FILTER (WHERE je.entry_date <= p_end), 0),
        COUNT(DISTINCT je.id)   FILTER (WHERE je.entry_date <= p_end)
    FROM public.accounts a
    LEFT JOIN public.journal_lines jl   ON jl.account_id = a.id
    LEFT JOIN public.journal_entries je ON je.id = jl.journal_entry_id
                                       AND je.organization_id = p_org
    WHERE a.organization_id = p_org
      AND a.is_active = true
    GROUP BY a.id, a.name, a.code, a.type;
$$;

COMMENT ON FUNCTION public.report_account_balances(uuid, date, date) IS
    'Per-account GL trial balance (period + cumulative debit/credit) for the Net Worth / P&L reports.';

-- Make the running-balance recalculation deterministic when rows share (date, created_at).
--
-- The function ordered by (date, created_at) only. Any tie made the chain order arbitrary:
-- balance_after was accumulated in one order while readers (and the next recalculation's
-- "previous balance" lookup) saw another, so running balances zig-zagged and the closing
-- balance was wrong (Twalumbu payroll 2026-09-29: K99,162.49 out, balance shown
-- 103,435 -> 90,009 instead of -> 4,272). The application now writes distinct created_at
-- for bulk inserts; this adds `id` as the final tiebreak so legacy/other ties are stable too.
--
-- Same signature and semantics otherwise; safe to re-run.
CREATE OR REPLACE FUNCTION public.recalculate_cashbook_balances(
    p_organization_id UUID,
    p_target_date DATE,
    p_target_created_at TIMESTAMP WITH TIME ZONE,
    p_account_type TEXT,
    p_wallet_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_running_balance NUMERIC := 0;
    v_prev_balance NUMERIC;
    v_entry RECORD;
BEGIN
    SELECT balance_after INTO v_prev_balance
    FROM public.cashbook_entries
    WHERE organization_id = p_organization_id
      AND account_type = p_account_type
      AND status != 'PENDING'
      AND (
        (p_wallet_id IS NULL AND wallet_id IS NULL)
        OR (p_wallet_id IS NOT NULL AND wallet_id = p_wallet_id)
      )
      AND (
        date < p_target_date
        OR (date = p_target_date AND created_at < p_target_created_at)
      )
    ORDER BY date DESC, created_at DESC, id DESC
    LIMIT 1;

    IF v_prev_balance IS NOT NULL THEN
        v_running_balance := v_prev_balance;
    END IF;

    FOR v_entry IN
        SELECT id, status, debit, credit
        FROM public.cashbook_entries
        WHERE organization_id = p_organization_id
          AND account_type = p_account_type
          AND (
            (p_wallet_id IS NULL AND wallet_id IS NULL)
            OR (p_wallet_id IS NOT NULL AND wallet_id = p_wallet_id)
          )
          AND (
            date > p_target_date
            OR (date = p_target_date AND created_at >= p_target_created_at)
          )
        ORDER BY date ASC, created_at ASC, id ASC
    LOOP
        IF v_entry.status = 'PENDING' THEN
            UPDATE public.cashbook_entries SET balance_after = 0 WHERE id = v_entry.id;
        ELSE
            v_running_balance := v_running_balance + COALESCE(v_entry.debit, 0) - COALESCE(v_entry.credit, 0);
            UPDATE public.cashbook_entries SET balance_after = v_running_balance WHERE id = v_entry.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

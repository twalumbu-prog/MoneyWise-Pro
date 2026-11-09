-- Make recalculate_cashbook_balances self-healing.
--
-- It used to start from the PREVIOUS ROW's stored balance_after. If one row was ever left
-- with a wrong balance (Blue Opus 2026-11-05: the sync was killed by a 45s timeout between
-- the INSERT, which writes balance_after = 0, and this RPC), every later recalculation
-- inherited the bad value and the wallet showed K37.70 instead of ~K1,120.
--
-- It now anchors on the SUM of debit - credit of all earlier non-PENDING rows, which cannot
-- be poisoned by a stale stored balance. The next write to a wallet repairs the whole chain.
-- Same signature and ordering as 20260930090000; safe to re-run.
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
    v_entry RECORD;
BEGIN
    SELECT COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0) INTO v_running_balance
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
      );

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

-- RPC to recalculate cashbook balances in milliseconds directly in PostgreSQL
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
    -- 1. Find the entry immediately BEFORE the target (logical temporal predecessor)
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
    ORDER BY date DESC, created_at DESC
    LIMIT 1;

    IF v_prev_balance IS NOT NULL THEN
        v_running_balance := v_prev_balance;
    END IF;

    -- 2. Recalculate entries from the target point forward in a cursor loop
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
        ORDER BY date ASC, created_at ASC
    LOOP
        IF v_entry.status = 'PENDING' THEN
            UPDATE public.cashbook_entries
            SET balance_after = 0
            WHERE id = v_entry.id;
        ELSE
            v_running_balance := v_running_balance + COALESCE(v_entry.debit, 0) - COALESCE(v_entry.credit, 0);
            UPDATE public.cashbook_entries
            SET balance_after = v_running_balance
            WHERE id = v_entry.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

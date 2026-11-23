-- Fee credit (earned from badges, see 20261120120000_progress_badges_points.sql) can pay part of a MoneyWise Ads purchase.
-- It cannot reduce what Lipila or Lenco charge: they take their own fee from the wallet. Ads are the one fee MoneyWise sets itself.
-- Keep in step with the inline migration in apps/api/src/index.ts.

ALTER TABLE public.ad_campaigns ADD COLUMN IF NOT EXISTS credit_applied NUMERIC(12, 2) NOT NULL DEFAULT 0;   -- kwacha of fee credit used on this ad

ALTER TABLE public.user_points_ledger DROP CONSTRAINT IF EXISTS user_points_ledger_kind_check;
ALTER TABLE public.user_points_ledger ADD CONSTRAINT user_points_ledger_kind_check CHECK (kind IN ('CONVERT','GIFT','REDEEM','SPEND','RESTORE'));

-- Uses fee credit: p_amount kwacha, no more than the balance. p_ref makes the same use happen once (a retry returns the same answer).
CREATE OR REPLACE FUNCTION public.progress_spend_credit(p_user UUID, p_amount NUMERIC, p_ref TEXT, p_reason TEXT)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE bal NUMERIC;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('progress:' || p_user::text));
    IF p_amount <= 0 THEN RAISE EXCEPTION 'BAD_AMOUNT'; END IF;
    IF EXISTS (SELECT 1 FROM public.user_points_ledger WHERE user_id = p_user AND ref = p_ref) THEN RETURN p_amount; END IF;
    SELECT COALESCE(SUM(credit), 0) INTO bal FROM public.user_points_ledger WHERE user_id = p_user;
    IF p_amount > bal THEN RAISE EXCEPTION 'NOT_ENOUGH_CREDIT'; END IF;
    INSERT INTO public.user_points_ledger (user_id, kind, credit, reason, ref) VALUES (p_user, 'SPEND', -p_amount, p_reason, p_ref);
    RETURN p_amount;
END $$;

-- Gives credit back (an ad that was cancelled or rejected, or a payment that failed). Once per p_ref.
CREATE OR REPLACE FUNCTION public.progress_restore_credit(p_user UUID, p_amount NUMERIC, p_ref TEXT, p_reason TEXT)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('progress:' || p_user::text));
    IF p_amount <= 0 THEN RAISE EXCEPTION 'BAD_AMOUNT'; END IF;
    IF EXISTS (SELECT 1 FROM public.user_points_ledger WHERE user_id = p_user AND ref = p_ref) THEN RETURN p_amount; END IF;
    INSERT INTO public.user_points_ledger (user_id, kind, credit, reason, ref) VALUES (p_user, 'RESTORE', p_amount, p_reason, p_ref);
    RETURN p_amount;
END $$;
GRANT EXECUTE ON FUNCTION public.progress_spend_credit(UUID, NUMERIC, TEXT, TEXT), public.progress_restore_credit(UUID, NUMERIC, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

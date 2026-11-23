-- XP can be converted to points only once a calendar month (Lusaka time). Rates (20 XP = 1 point, 10 points = K1) are set in the API.
-- Keep in step with the inline migration in apps/api/src/index.ts.

CREATE OR REPLACE FUNCTION public.progress_convert(p_user UUID, p_xp INTEGER, p_xp_per_point INTEGER, p_xp_earned INTEGER)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE spent INTEGER; pts INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('progress:' || p_user::text));
    IF p_xp <= 0 OR p_xp_per_point <= 0 OR p_xp % p_xp_per_point <> 0 THEN RAISE EXCEPTION 'BAD_AMOUNT'; END IF;
    IF EXISTS (
        SELECT 1 FROM public.user_points_ledger
        WHERE user_id = p_user AND kind = 'CONVERT'
          AND date_trunc('month', created_at AT TIME ZONE 'Africa/Lusaka') = date_trunc('month', NOW() AT TIME ZONE 'Africa/Lusaka')
    ) THEN RAISE EXCEPTION 'ALREADY_CONVERTED_THIS_MONTH'; END IF;
    SELECT COALESCE(SUM(xp_spent), 0) INTO spent FROM public.user_points_ledger WHERE user_id = p_user;
    IF p_xp > p_xp_earned - spent THEN RAISE EXCEPTION 'NOT_ENOUGH_XP'; END IF;
    pts := p_xp / p_xp_per_point;
    INSERT INTO public.user_points_ledger (user_id, kind, points, xp_spent, reason) VALUES (p_user, 'CONVERT', pts, p_xp, 'XP converted to points');
    RETURN pts;
END $$;

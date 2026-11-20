-- Progress: badges (bronze / silver / gold / platinum), a daily-use streak, XP, spendable points and fee credit.
-- Badges are earned once per person. XP is NOT stored: it is the sum of the XP of the badges earned (the catalogue is in the API), so it can't drift.
-- Points and fee credit are a ledger: every change is a row, a balance is the sum. Converting and redeeming run inside the database under a
-- per-person lock, so two taps at once can't spend the same XP or points twice.
-- Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.user_progress (
    user_id      UUID PRIMARY KEY,
    streak       INTEGER NOT NULL DEFAULT 0,          -- consecutive days with activity, up to and including last_active
    best_streak  INTEGER NOT NULL DEFAULT 0,
    active_days  INTEGER NOT NULL DEFAULT 0,
    last_active  DATE,                                -- a Lusaka calendar day
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_badges (
    user_id    UUID NOT NULL,
    badge_id   TEXT NOT NULL,
    tier       TEXT NOT NULL CHECK (tier IN ('BRONZE','SILVER','GOLD','PLATINUM')),
    xp         INTEGER NOT NULL CHECK (xp >= 0),      -- what it was worth when earned
    earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS public.user_points_ledger (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('CONVERT','GIFT','REDEEM')),
    points     INTEGER NOT NULL DEFAULT 0,            -- + earned, - spent
    xp_spent   INTEGER NOT NULL DEFAULT 0,            -- XP turned into points (CONVERT)
    credit     NUMERIC(12, 2) NOT NULL DEFAULT 0,     -- kwacha of fee credit: + gained (REDEEM), - used
    reason     TEXT,
    ref        TEXT,                                  -- makes a one-off row (a tier gift) happen only once
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_points_ledger_ref ON public.user_points_ledger (user_id, ref);
CREATE INDEX IF NOT EXISTS idx_points_ledger_user ON public.user_points_ledger (user_id, created_at DESC);

ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_points_ledger ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.user_progress, public.user_badges, public.user_points_ledger TO service_role;

-- Turn XP into points: p_xp must be a positive multiple of p_xp_per_point and no more than the XP not yet converted (p_xp_earned is the XP the
-- person has earned in all, worked out by the API from their badges). Returns the points gained.
CREATE OR REPLACE FUNCTION public.progress_convert(p_user UUID, p_xp INTEGER, p_xp_per_point INTEGER, p_xp_earned INTEGER)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE spent INTEGER; pts INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('progress:' || p_user::text));
    IF p_xp <= 0 OR p_xp_per_point <= 0 OR p_xp % p_xp_per_point <> 0 THEN RAISE EXCEPTION 'BAD_AMOUNT'; END IF;
    SELECT COALESCE(SUM(xp_spent), 0) INTO spent FROM public.user_points_ledger WHERE user_id = p_user;
    IF p_xp > p_xp_earned - spent THEN RAISE EXCEPTION 'NOT_ENOUGH_XP'; END IF;
    pts := p_xp / p_xp_per_point;
    INSERT INTO public.user_points_ledger (user_id, kind, points, xp_spent, reason) VALUES (p_user, 'CONVERT', pts, p_xp, 'XP converted to points');
    RETURN pts;
END $$;

-- Turn points into fee credit (kwacha): p_points positive and no more than the balance.
CREATE OR REPLACE FUNCTION public.progress_redeem(p_user UUID, p_points INTEGER, p_credit NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE bal INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('progress:' || p_user::text));
    IF p_points <= 0 OR p_credit <= 0 THEN RAISE EXCEPTION 'BAD_AMOUNT'; END IF;
    SELECT COALESCE(SUM(points), 0) INTO bal FROM public.user_points_ledger WHERE user_id = p_user;
    IF p_points > bal THEN RAISE EXCEPTION 'NOT_ENOUGH_POINTS'; END IF;
    INSERT INTO public.user_points_ledger (user_id, kind, points, credit, reason) VALUES (p_user, 'REDEEM', -p_points, p_credit, 'Points redeemed for fee credit');
    RETURN p_credit;
END $$;
GRANT EXECUTE ON FUNCTION public.progress_convert(UUID, INTEGER, INTEGER, INTEGER), public.progress_redeem(UUID, INTEGER, NUMERIC) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Money moved by a business or personal account: how many confirmed entries and how much (in + out), for the "money movement" badges.
CREATE OR REPLACE FUNCTION public.progress_money_stats(p_org UUID)
RETURNS TABLE (txn_count BIGINT, volume NUMERIC) LANGUAGE sql STABLE AS $$
    SELECT COUNT(*)::bigint, COALESCE(SUM(COALESCE(debit, 0) + COALESCE(credit, 0)), 0)::numeric
    FROM public.cashbook_entries
    WHERE organization_id = p_org AND status IN ('COMPLETED', 'ACCOUNTED', 'DISBURSED') AND entry_type IN ('INFLOW', 'DISBURSEMENT', 'EXPENSE');
$$;
GRANT EXECUTE ON FUNCTION public.progress_money_stats(UUID) TO service_role;

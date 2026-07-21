-- Business achievements for Financial Highlights.
--
-- One row per all-time record an organization has broken (best revenue day,
-- best profit month, and so on). Rows are written by the API when a new record
-- is detected, and read back by the Highlights card so the app can pop a badge
-- and confetti exactly once per achievement.
--
-- We store the beaten value alongside the new one so the UI can say "K12,400 —
-- your best day ever, K3,100 above your previous record" without recomputing.

CREATE TABLE IF NOT EXISTS public.business_achievements (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- What was measured: money in (REVENUE) or money in minus money out (PROFIT).
    metric           TEXT NOT NULL CHECK (metric IN ('REVENUE', 'PROFIT')),
    -- Over what window the record was set.
    period           TEXT NOT NULL CHECK (period IN ('DAY', 'WEEK', 'MONTH')),
    value            NUMERIC(14, 2) NOT NULL,
    -- The record this one beat. NULL for a first-ever record.
    previous_value   NUMERIC(14, 2),
    period_start     DATE NOT NULL,
    period_end       DATE NOT NULL,
    achieved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Set once the user has seen the badge; drives the "celebrate once" behaviour.
    seen_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A given org can only hold one record per metric+period+window. Re-running
-- detection for the same day/week/month updates the existing row rather than
-- stacking duplicate badges (see ON CONFLICT in highlights.service.ts).
CREATE UNIQUE INDEX IF NOT EXISTS business_achievements_unique_window
    ON public.business_achievements (organization_id, metric, period, period_start);

-- Feed query: newest achievements for an org, unseen first.
CREATE INDEX IF NOT EXISTS business_achievements_org_achieved_at
    ON public.business_achievements (organization_id, achieved_at DESC);

-- RLS on, no policies: this table is read and written exclusively through the
-- API with the service-role key, matching the posture of every other
-- non-user-facing table (see 20260627120000_enable_rls_security_hardening.sql).
ALTER TABLE public.business_achievements ENABLE ROW LEVEL SECURITY;

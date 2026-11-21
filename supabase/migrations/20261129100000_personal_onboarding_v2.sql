-- Personal onboarding v2 (docs/personal-onboarding-plan.md, milestone M1).
--
-- 1. onboarding_progress.flow — which wizard an org is on. Every existing row (business or personal, finished or
--    not) stays on the LEGACY numbered wizard; only personal orgs created after the API flag
--    PERSONAL_ONBOARDING_V2=1 is switched on get PERSONAL_V2.
-- 2. onboarding_progress.steps — PERSONAL_V2 state, keyed by step name so the order can change without breaking
--    saved progress: { "<key>": { "state": "done" | "skipped", "at": "<iso>" } }. The numbered columns are
--    left untouched for LEGACY.
-- 3. users: first/last name, date of birth and avatar (a person's picture, separate from an org logo).
--    users.name stays the display name and is kept in step with first + last.

ALTER TABLE public.onboarding_progress
    ADD COLUMN IF NOT EXISTS flow TEXT NOT NULL DEFAULT 'LEGACY',
    ADD COLUMN IF NOT EXISTS steps JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.onboarding_progress DROP CONSTRAINT IF EXISTS onboarding_progress_flow_check;
ALTER TABLE public.onboarding_progress
    ADD CONSTRAINT onboarding_progress_flow_check CHECK (flow IN ('LEGACY', 'PERSONAL_V2'));

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS first_name TEXT,
    ADD COLUMN IF NOT EXISTS last_name TEXT,
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 1. Scam cleanup. A "You have received ZMW …" that came from an ordinary phone number is a scam, not a transaction
--    (operators and banks send from a name or a short code). New ones are now rejected on the phone and on the server;
--    this dismisses the ones already waiting for review. Recorded ones are left alone: they are in the ledger, so the
--    person decides (see the query at the bottom).
UPDATE public.momo_captures
SET status = 'DISMISSED', updated_at = NOW()
WHERE status IN ('PENDING', 'MATCHED')
  AND sender ~ '^[+0-9 ().-]+$'
  AND length(regexp_replace(sender, '[^0-9]', '', 'g')) >= 7;

-- 2. Grow plan check-ins (on track / overspending / not saving enough): each goes out at most once per person,
--    workspace and key (e.g. 'spend80:2026-11').
CREATE TABLE IF NOT EXISTS public.push_alert_log (
    user_id         UUID        NOT NULL,
    organization_id UUID        NOT NULL,
    key             TEXT        NOT NULL,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, organization_id, key)
);
ALTER TABLE public.push_alert_log ENABLE ROW LEVEL SECURITY;   -- server only (service role); no policies

-- 3. Schedules (same registry + dispatcher as every other internal job, 20261026120000_internal_cron_scheduler.sql).
--    Weekly check-in: Monday 08:00 Lusaka (06:00 UTC). Daily alerts: 18:00 Lusaka (16:00 UTC), an hour before the
--    19:00 "to confirm" push, and well before night.
INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note)
VALUES
    ('progress-weekly', '/cron/progress-weekly', '0 6 * * 1',  55000, TRUE, 604800, TRUE, 'Weekly Grow plan check-in push'),
    ('progress-daily',  '/cron/progress-daily',  '0 16 * * *', 55000, TRUE, 86400,  TRUE, 'Daily Grow plan alerts (budget, savings, month review, set-up nudge)')
ON CONFLICT (job) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
        PERFORM cron.schedule('internal:progress-weekly', '0 6 * * 1',  'SELECT public.internal_cron_call(''progress-weekly'')');
        PERFORM cron.schedule('internal:progress-daily',  '0 16 * * *', 'SELECT public.internal_cron_call(''progress-daily'')');
    END IF;
END $$;

-- Recorded transactions that came from a personal number (review these by hand; not changed here):
-- SELECT id, user_id, sender, amount, occurred_at, raw_text FROM public.momo_captures
-- WHERE status = 'POSTED' AND sender ~ '^[+0-9 ().-]+$' AND length(regexp_replace(sender, '[^0-9]', '', 'g')) >= 7;

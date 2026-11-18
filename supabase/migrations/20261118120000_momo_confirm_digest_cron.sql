-- Daily "N transactions to confirm" push for captured mobile money transactions, at 19:00 Lusaka (17:00 UTC):
-- evening, when the day's transactions are in and people are free, and well before night.
-- Same registry + dispatcher as every other internal job (20261026120000_internal_cron_scheduler.sql).
INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note)
VALUES ('momo-confirm-digest', '/cron/momo-confirm-digest', '0 17 * * *', 55000, TRUE, 86400, TRUE, 'Daily "N transactions to confirm" push (mobile money captures)')
ON CONFLICT (job) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
        PERFORM cron.schedule('internal:momo-confirm-digest', '0 17 * * *', 'SELECT public.internal_cron_call(''momo-confirm-digest'')');
    END IF;
END $$;

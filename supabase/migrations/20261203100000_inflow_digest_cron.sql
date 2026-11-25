-- Evening digest of the day's deposits (19:00 Lusaka = 17:00 UTC) for people who were over the daily cap of individual "money came in" emails.
INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note)
VALUES ('inflow-digest', '/cron/inflow-digest', '0 17 * * *', 55000, TRUE, 86400, TRUE, 'One evening email summarising the day''s deposits')
ON CONFLICT (job) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
        PERFORM cron.schedule('internal:inflow-digest', '0 17 * * *', 'SELECT public.internal_cron_call(''inflow-digest'')');
    END IF;
END $$;

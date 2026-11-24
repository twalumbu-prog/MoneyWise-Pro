-- Daily capture digest at 18:00 Lusaka (16:00 UTC).
INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note)
VALUES ('capture-digest', '/cron/capture-digest', '0 16 * * *', 55000, TRUE, 86400, TRUE, 'Daily "N captured, M need review" push')
ON CONFLICT (job) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
        PERFORM cron.schedule('internal:capture-digest', '0 16 * * *', 'SELECT public.internal_cron_call(''capture-digest'')');
    END IF;
END $$;

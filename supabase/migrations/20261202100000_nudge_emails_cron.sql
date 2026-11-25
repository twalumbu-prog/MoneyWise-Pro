-- Personal nudge emails (bills due, setup steps, Sunday progress, Friday team recap): one daily run at 07:00 Lusaka (05:00 UTC).
-- Same registry + dispatcher as every other internal job (20261026120000_internal_cron_scheduler.sql). Nothing is sent twice: each
-- email claims a key in push_alert_log, and people switch them off with the footer link (users.preferences.notifications.nudge_emails).
INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note)
VALUES ('nudge-emails', '/cron/nudge-emails', '0 5 * * *', 55000, TRUE, 86400, TRUE, 'Personal nudge emails (bills due, setup steps, weekly progress, team recap)')
ON CONFLICT (job) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
        PERFORM cron.schedule('internal:nudge-emails', '0 5 * * *', 'SELECT public.internal_cron_call(''nudge-emails'')');
    END IF;
END $$;

-- Daily PostHog tracking-health check (API: POST /cron/tracking-health).
-- 06:00 UTC = 08:00 Zambia. Emails super-admins only when iOS/Android/web/API analytics have stopped arriving;
-- the snapshot is kept in app_settings.tracking_health_last. Prerequisites: the internal scheduler migration
-- (20261026120000), the API deployed with the /cron/tracking-health route, and a PostHog personal API key saved in Admin.
INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note)
VALUES ('tracking-health', '/cron/tracking-health', '0 6 * * *', 55000, FALSE, 86400, TRUE,
        'Daily check that PostHog usage/session/money-flow events are still arriving; emails only on problems')
ON CONFLICT (job) DO UPDATE SET path = EXCLUDED.path, schedule = EXCLUDED.schedule, timeout_ms = EXCLUDED.timeout_ms,
    expected_interval_seconds = EXCLUDED.expected_interval_seconds, note = EXCLUDED.note;

DO $$ BEGIN PERFORM cron.unschedule('internal:tracking-health'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('internal:tracking-health', '0 6 * * *', $$SELECT public.internal_cron_call('tracking-health')$$);

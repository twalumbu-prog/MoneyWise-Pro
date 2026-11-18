-- Keeps imported products current by running the API's POST /cron/import-refresh every 5 minutes through the internal cron scheduler.
--
-- Apply this AFTER the API that has the /cron/import-refresh route is deployed to the address in app_settings.cron_api_url.

INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note)
VALUES ('import-refresh', '/cron/import-refresh', '*/5 * * * *', 40000, TRUE, 300, TRUE,
        'Re-checks stale imported products at their source and runs the saved discovery feeds')
ON CONFLICT (job) DO UPDATE
    SET path = EXCLUDED.path, schedule = EXCLUDED.schedule, timeout_ms = EXCLUDED.timeout_ms,
        expected_interval_seconds = EXCLUDED.expected_interval_seconds, active = TRUE, note = EXCLUDED.note;

SELECT cron.schedule('internal:import-refresh', '*/5 * * * *', $$SELECT public.internal_cron_call('import-refresh')$$);

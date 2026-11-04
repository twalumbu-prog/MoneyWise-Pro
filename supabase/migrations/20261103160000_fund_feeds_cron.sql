-- Reads the fund prices Longhorn Associates publishes on its website by running the API's POST /cron/fund-feeds every 6 hours.
--
-- Apply this AFTER the API that has the /cron/fund-feeds route is deployed to the address in app_settings.cron_api_url.

INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note)
VALUES ('fund-feeds', '/cron/fund-feeds', '15 */6 * * *', 30000, TRUE, 21600, TRUE,
        'Reads the fund prices Longhorn publishes so its funds carry real prices')
ON CONFLICT (job) DO UPDATE
    SET path = EXCLUDED.path, schedule = EXCLUDED.schedule, timeout_ms = EXCLUDED.timeout_ms,
        expected_interval_seconds = EXCLUDED.expected_interval_seconds, active = TRUE, note = EXCLUDED.note;

SELECT cron.schedule('internal:fund-feeds', '15 */6 * * *', $$SELECT public.internal_cron_call('fund-feeds')$$);

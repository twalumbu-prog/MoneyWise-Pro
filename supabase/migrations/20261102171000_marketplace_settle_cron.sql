-- Closes Marketplace auctions on time (and sends the payment reminders and non-payment strikes) by running the API's
-- POST /marketplace/settle every minute through the internal cron scheduler.
--
-- Apply this AFTER the API that has the /marketplace/settle route is deployed to the address in app_settings.cron_api_url,
-- otherwise the scheduler calls a route that doesn't exist yet and the cron watchdog will flag the job.

INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note)
VALUES ('marketplace-settle', '/marketplace/settle', '* * * * *', 30000, TRUE, 60, TRUE,
        'Closes ended Marketplace auctions, sends winner reminders, marks unpaid wins')
ON CONFLICT (job) DO UPDATE
    SET path = EXCLUDED.path, schedule = EXCLUDED.schedule, timeout_ms = EXCLUDED.timeout_ms,
        expected_interval_seconds = EXCLUDED.expected_interval_seconds, active = TRUE, note = EXCLUDED.note;

SELECT cron.schedule('internal:marketplace-settle', '* * * * *', $$SELECT public.internal_cron_call('marketplace-settle')$$);

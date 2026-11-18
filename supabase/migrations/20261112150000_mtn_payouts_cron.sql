-- Every minute: read the MTN callbacks the edge function stored and re-check open MoMo payouts (API: POST /cron/mtn-payouts).
-- Apply this only AFTER the API with the /cron/mtn-payouts route is deployed, or the scheduler will log a failed call each minute.
INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note)
VALUES ('mtn-payouts', '/cron/mtn-payouts', '* * * * *', 40000, TRUE, 60, TRUE,
        'Processes stored MTN callbacks and re-checks open MoMo payouts with MTN')
ON CONFLICT (job) DO UPDATE SET path = EXCLUDED.path, schedule = EXCLUDED.schedule, timeout_ms = EXCLUDED.timeout_ms,
    expected_interval_seconds = EXCLUDED.expected_interval_seconds, note = EXCLUDED.note;

DO $$ BEGIN PERFORM cron.unschedule('internal:mtn-payouts'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('internal:mtn-payouts', '* * * * *', $$SELECT public.internal_cron_call('mtn-payouts')$$);

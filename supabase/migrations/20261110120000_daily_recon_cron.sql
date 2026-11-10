-- Daily MoneyWise-wallets vs live-Lenco reconciliation (API: POST /cron/daily-recon).
-- 05:30 UTC = 07:30 Zambia. Emails super-admins an all-clear or the list of organisations that differ;
-- the snapshot is kept in app_settings.daily_recon_last. Prerequisite: the internal scheduler migration
-- (20261026120000) and the API deployed with the /cron/daily-recon route.
INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note)
VALUES ('daily-recon', '/cron/daily-recon', '30 5 * * *', 55000, FALSE, 86400, TRUE,
        'Daily MoneyWise wallet totals vs live Lenco balances; emails differences')
ON CONFLICT (job) DO UPDATE SET path = EXCLUDED.path, schedule = EXCLUDED.schedule, timeout_ms = EXCLUDED.timeout_ms,
    expected_interval_seconds = EXCLUDED.expected_interval_seconds, note = EXCLUDED.note;

DO $$ BEGIN PERFORM cron.unschedule('internal:daily-recon'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('internal:daily-recon', '30 5 * * *', $$SELECT public.internal_cron_call('daily-recon')$$);

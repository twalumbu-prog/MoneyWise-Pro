-- Automations + scheduled-item scheduler — cron schedule.
--
-- DELIBERATELY NOT IN supabase/migrations/: this turns on a job that can pay
-- out real money and create requisitions, so it is opt-in. Run it by hand
-- (Supabase SQL editor or psql) once you have:
--
--   1. Applied migration 20260930120000_automations.sql.
--   2. Deployed the API (main) with the /automations routes.
--   3. Deployed the edge function:  supabase functions deploy run-automations
--   4. Set its secrets: API_URL (prod API base URL), LENCO_SYNC_SECRET.
--   5. Smoke-tested it once by hand:
--        curl -X POST "$API_URL/automations/tick" -H "Authorization: Bearer $LENCO_SYNC_SECRET"
--
-- Every minute. Each tick (a) picks up new wallet deposits for active
-- automations and forwards them, (b) settles in-flight payouts and sends
-- Proof of Payment emails, (c) fires scheduled items whose due date has come.
-- Every step is idempotent, so overlapping or repeated ticks are harmless.
--
-- Replace <PROJECT_REF> with the project ref of the CURRENT production
-- Supabase project (the other cron jobs use the same URL shape).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    PERFORM cron.unschedule('run-automations-cron');
EXCEPTION WHEN OTHERS THEN
    NULL;  -- not scheduled yet, which is fine
END $$;

SELECT cron.schedule(
    'run-automations-cron',
    '* * * * *',
    $$
        SELECT net.http_post(
            url := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-automations',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := '{}'::jsonb
        );
    $$
);

-- Ledger Guardian — dedicated cron (OPTIONAL: the Lenco sync already runs a guardian pass with its spare time).
--
-- DELIBERATELY NOT IN supabase/migrations/: it is opt-in. Do this in order:
--   1. Deploy the API (main) containing apps/api/src/services/ledgerGuardian and the POST /lenco/guardian route.
--   2. Deploy the edge function:  supabase functions deploy run-ledger-guardian   (secrets API_URL + LENCO_SYNC_SECRET are shared with sync-lenco-transactions)
--   3. Leave LEDGER_GUARDIAN_MODE unset (= 'report': verifies and records health, changes NOTHING) for a few days and read the results:
--        SELECT key, value->>'status' AS status, value->'closing'->>'diff' AS diff, value->'issues' AS issues
--        FROM app_settings WHERE key LIKE 'ledger_health:%';
--   4. When the reports look right, set LEDGER_GUARDIAN_MODE=heal on the API host (safe repairs only: reference counters, duplicate rows,
--      retained-fee rows, unposted platform-fee sweeps, balance chains). Commission sweeps (real money) additionally need SWEEP_GUARANTEE=on.
--
-- Every 5 minutes; each call does at most one full-history pass and otherwise cheap incremental checks. Replace <PROJECT_REF>.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    PERFORM cron.unschedule('run-ledger-guardian-cron');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'run-ledger-guardian-cron',
    '*/5 * * * *',
    $$
        SELECT net.http_post(
            url := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-ledger-guardian',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := '{}'::jsonb
        );
    $$
);

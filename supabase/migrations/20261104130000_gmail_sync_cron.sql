-- Gmail capture sync — every 5 minutes.
-- Prereqs: migration 20261104120000_gmail_capture.sql applied, API deployed with POST /integrations/gmail/sync,
-- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / MESSAGING_TOKEN_KEY set on the prod API, and the edge function deployed:
--   supabase functions deploy run-gmail-sync --no-verify-jwt
-- (it reuses the API_URL / LENCO_SYNC_SECRET secrets already set for run-automations).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN PERFORM cron.unschedule('run-gmail-sync-cron'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
    'run-gmail-sync-cron',
    '*/5 * * * *',
    $$
        SELECT net.http_post(
            url := 'https://ahatvfmvhecakpxtpnay.supabase.co/functions/v1/run-gmail-sync',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := '{}'::jsonb
        );
    $$
);

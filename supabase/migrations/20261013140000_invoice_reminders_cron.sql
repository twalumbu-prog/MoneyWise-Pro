-- Credit-sale follow-up reminders — daily cron (07:00 UTC ≈ 09:00 Lusaka).
-- Prereqs: migration 20261013120000_customer_invoices.sql applied, API deployed with POST /invoices/tick,
-- edge function deployed:  supabase functions deploy run-invoice-reminders --no-verify-jwt
-- (it reuses the API_URL / LENCO_SYNC_SECRET secrets already set for run-automations).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN PERFORM cron.unschedule('run-invoice-reminders-cron'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
    'run-invoice-reminders-cron',
    '0 7 * * *',
    $$
        SELECT net.http_post(
            url := 'https://ahatvfmvhecakpxtpnay.supabase.co/functions/v1/run-invoice-reminders',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := '{}'::jsonb
        );
    $$
);

-- 1. Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Safely unschedule any existing sync cron to ensure idempotency
DO $$
BEGIN
    PERFORM cron.unschedule('sync-lenco-transactions-cron');
EXCEPTION WHEN OTHERS THEN
    -- Cron might not exist yet, which is fine
    NULL;
END $$;

-- 3. Schedule the sync-lenco-transactions Edge Function to execute every 5 minutes
SELECT cron.schedule(
    'sync-lenco-transactions-cron',
    '*/5 * * * *',
    $$
        SELECT net.http_post(
            url := 'https://klfeluphcutgppkhaxyl.supabase.co/functions/v1/sync-lenco-transactions',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := '{}'::jsonb
        );
    $$
);

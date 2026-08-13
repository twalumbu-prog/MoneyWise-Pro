-- Schedule the send-weekly-highlights edge function via pg_cron.
--
-- The edge function (supabase/functions/send-weekly-highlights/index.ts) was
-- deployed but never wired to pg_cron — it has never run since it was created.
--
-- Schedule: every Monday at 05:00 UTC (07:00 Lusaka / CAT).
-- This summarises the week that ended Sunday night and emails every org.
--
-- Requires pg_cron + pg_net (already enabled by the auto_categorization migration).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Safely unschedule if a previous attempt left a stale entry.
DO $$
BEGIN
    PERFORM cron.unschedule('send-weekly-highlights-cron');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
    'send-weekly-highlights-cron',
    '0 5 * * 1',   -- every Monday 05:00 UTC
    $$
    SELECT net.http_post(
        url     := 'https://klfeluphcutgppkhaxyl.supabase.co/functions/v1/send-weekly-highlights',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := '{}'::jsonb
    );
    $$
);

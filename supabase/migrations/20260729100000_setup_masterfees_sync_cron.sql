-- Periodic Master Fees sync, mirroring 20260606080000_setup_lenco_sync_cron.sql.
-- Without this, Master Fees invoices/payments only sync when someone manually
-- clicks "Sync Now" in Settings — this schedules the same automatic cadence the
-- Lenco integration already has.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    PERFORM cron.unschedule('sync-masterfees-cron');
EXCEPTION WHEN OTHERS THEN
    -- Cron might not exist yet, which is fine
    NULL;
END $$;

SELECT cron.schedule(
    'sync-masterfees-cron',
    '*/5 * * * *',
    $$
        SELECT net.http_post(
            url := 'https://klfeluphcutgppkhaxyl.supabase.co/functions/v1/sync-masterfees',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := '{}'::jsonb
        );
    $$
);

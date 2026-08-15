-- 1) Per-channel accounting for manually-recorded Master Fees payments.
--
-- Master Fees' `transactions.payment_method` carries real channel granularity
-- ('bank' | 'mobile_money' | 'manual', observed live across connected schools —
-- Blue Opus Academy has all three). Until now every manually-recorded payment
-- landed in one generic "Master Fees Manual Collections" GL account regardless
-- of channel. This column lets the sync tag each cashbook row with its channel
-- so ledger.service.ts can route it to a channel-specific asset account
-- (Bank / Mobile Money / Cash-Other) instead of one undifferentiated bucket —
-- nullable and backward-compatible; NULL means "unclassified" (pre-existing
-- rows, or any other source_type entirely).
ALTER TABLE cashbook_entries
    ADD COLUMN IF NOT EXISTS mf_payment_channel varchar(20);

COMMENT ON COLUMN cashbook_entries.mf_payment_channel IS
    'Master Fees manual-payment channel (BANK | MOBILE | OTHER), used by ledger.service.ts to route MASTERFEES_MANUAL entries to a channel-specific collections account. NULL for all non-Master-Fees rows and pre-migration Master Fees rows.';

-- 2) Faster sync cadence now that the Cloudflare/Vercel-egress block (which
-- capped how often we could safely hit Master Fees) is resolved via OAuth.
-- Real-time delivery to the browser was already solved — every sync already
-- calls broadcastInvalidate(), which pushes a Supabase Realtime event that
-- RealtimeCacheSync.tsx picks up on every open tab and refetches instantly.
-- The only lever left is how often the sync itself runs — drop 5min -> 1min.
DO $$
BEGIN
    PERFORM cron.unschedule('sync-masterfees-cron');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'sync-masterfees-cron',
    '* * * * *',
    $$
        SELECT net.http_post(
            url := 'https://klfeluphcutgppkhaxyl.supabase.co/functions/v1/sync-masterfees',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := '{}'::jsonb
        );
    $$
);

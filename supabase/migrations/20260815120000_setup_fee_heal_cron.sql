-- Schedules the platform-fee self-healing pass (see reconciliation.service.ts
-- healMissingPlatformFees) every 6 hours across every Lenco-linked org.
--
-- Root cause it closes: the periodic Lenco sync (every 5 min) always skips posting
-- a "Split payment"/"Split-Inflow Payment" debit, trusting — without ever verifying —
-- that the originating collection was booked net and already absorbs it. When that
-- assumption breaks for any reason (confirmed 2026-08-15: Lenco's sub-account
-- split-payment config stopped sweeping some Twalumbu collections after 1 Aug), the
-- debit still fires but nothing absorbs it, and the fee silently vanishes from the
-- ledger — K868.11 sat undetected for over a month before this reconciliation session
-- found it by hand. This cron makes the same check run automatically, so a future gap
-- of the same shape gets posted within one 6-hour cycle instead of accumulating.
--
-- Idempotent (dedup by external_reference = the Lenco transaction id), and additive
-- only — it posts a missing EXPENSE row, it never touches or deletes anything.

DO $$
BEGIN
    PERFORM cron.unschedule('heal-platform-fees-cron');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'heal-platform-fees-cron',
    '17 */6 * * *',
    $$
        SELECT net.http_post(
            url := 'https://klfeluphcutgppkhaxyl.supabase.co/functions/v1/heal-platform-fees',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := '{}'::jsonb
        );
    $$
);

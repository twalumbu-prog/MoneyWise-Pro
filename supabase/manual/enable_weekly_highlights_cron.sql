-- Weekly Financial Highlights newsletter — cron schedule.
--
-- DELIBERATELY NOT IN supabase/migrations/: this file turns on a recurring
-- email to real admins, so it is opt-in. Run it by hand (Supabase SQL editor or
-- psql) only once you've verified the newsletter with a manual test send:
--
--   curl -X POST "$API_URL/ai/highlights/weekly-email" \
--        -H "Authorization: Bearer $LENCO_SYNC_SECRET" \
--        -H "Content-Type: application/json" \
--        -d '{"organizationId":"<org-uuid>","to":"you@example.com"}'
--
-- Prerequisites:
--   1. Migration 20260721120000_business_achievements.sql applied.
--   2. Edge function deployed:  supabase functions deploy send-weekly-highlights
--   3. Edge function secrets set: API_URL (prod API), LENCO_SYNC_SECRET.
--
-- Schedule: Mondays 05:00 UTC = 07:00 Africa/Lusaka. The run summarises the
-- week that ended the previous night (Mon–Sun).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    PERFORM cron.unschedule('send-weekly-highlights-cron');
EXCEPTION WHEN OTHERS THEN
    NULL;  -- not scheduled yet, which is fine
END $$;

SELECT cron.schedule(
    'send-weekly-highlights-cron',
    '0 5 * * 1',
    $$
        SELECT net.http_post(
            url := 'https://klfeluphcutgppkhaxyl.supabase.co/functions/v1/send-weekly-highlights',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := '{}'::jsonb
        );
    $$
);

-- To turn it back off:
--   SELECT cron.unschedule('send-weekly-highlights-cron');

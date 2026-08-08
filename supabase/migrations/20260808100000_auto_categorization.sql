-- Auto-categorization schema + hourly pg_cron worker
--
-- New columns on requisitions:
--   pre_classified_at      — set when early background classification runs at DISBURSED
--   is_auto_categorized    — true when the system auto-completed a stuck requisition
--   auto_categorized_at    — timestamp of auto-completion
--   auto_reminder_sent_at  — when the 12h "reminder" email was sent (dedup guard)

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS pre_classified_at        timestamptz,
  ADD COLUMN IF NOT EXISTS is_auto_categorized      boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_categorized_at      timestamptz,
  ADD COLUMN IF NOT EXISTS auto_reminder_sent_at    timestamptz;

COMMENT ON COLUMN public.requisitions.pre_classified_at     IS 'Set when early AI classification is triggered at DISBURSED status. Allows triggerAIReview to skip the AI call for already-classified items.';
COMMENT ON COLUMN public.requisitions.is_auto_categorized   IS 'True when the system automatically categorized a requisition that was stuck in DISBURSED for > 24 hours.';
COMMENT ON COLUMN public.requisitions.auto_categorized_at   IS 'Timestamp at which auto-categorization ran.';
COMMENT ON COLUMN public.requisitions.auto_reminder_sent_at IS 'Timestamp of the 12-hour pending-accounting reminder email. Used to prevent duplicate reminders.';

-- pg_cron: run the auto-complete edge function every hour.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    PERFORM cron.unschedule('auto-complete-requisitions-cron');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
    'auto-complete-requisitions-cron',
    '0 * * * *',
    $$
    SELECT net.http_post(
        url     := 'https://klfeluphcutgppkhaxyl.supabase.co/functions/v1/auto-complete-requisitions',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := '{}'::jsonb
    );
    $$
);

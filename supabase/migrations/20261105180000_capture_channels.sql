-- Per-channel capture and auto-post rules, e.g. {"EMAIL":{"capture":false},"MOMO_SMS":{"autoPost":false,"autoPostLimit":500}}.
-- A channel with no entry follows the org's own settings.
ALTER TABLE public.capture_settings ADD COLUMN IF NOT EXISTS channels JSONB NOT NULL DEFAULT '{}';

-- Per-person settings (Settings → Preferences in the personal app): notification channel, AI models, salary destination.
-- Keep in step with the inline migration in apps/api/src/index.ts.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

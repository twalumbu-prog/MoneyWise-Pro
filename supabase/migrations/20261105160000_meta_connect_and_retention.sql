-- Phase 1 housekeeping: one-time expiry email, Meta data-deletion requests, and the two daily jobs.

ALTER TABLE public.messaging_connections ADD COLUMN IF NOT EXISTS notified_expired_at TIMESTAMPTZ;

-- Holds no message content. The Meta user id is stored only as a hash.
CREATE TABLE IF NOT EXISTS public.meta_deletion_requests (
    confirmation_code TEXT PRIMARY KEY,
    user_hash         TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETE', 'FAILED')),
    messages_deleted  INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at      TIMESTAMPTZ
);

ALTER TABLE public.meta_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_deletion_requests TO service_role;

INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note) VALUES
    ('meta-token-health', '/cron/meta-token-health', '30 5 * * *', 55000, TRUE, 86400, TRUE, 'Marks expired Meta connections and emails the owner once'),
    ('capture-retention', '/cron/capture-retention', '45 2 * * *', 55000, TRUE, 86400, TRUE, 'Purges non-transaction messages and files after 90 days')
ON CONFLICT (job) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
        PERFORM cron.schedule('internal:meta-token-health', '30 5 * * *', 'SELECT public.internal_cron_call(''meta-token-health'')');
        PERFORM cron.schedule('internal:capture-retention', '45 2 * * *', 'SELECT public.internal_cron_call(''capture-retention'')');
    END IF;
END $$;

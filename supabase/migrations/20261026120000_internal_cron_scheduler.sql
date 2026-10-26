-- Internal scheduler: pg_cron -> pg_net -> API directly (no edge-function hop).
--
-- Why: the 5-minute Lenco sync / payout poll, MasterFees sync and the hourly auto-complete all lived on
-- the OLD Supabase project and silently stopped on 2026-10-21 when it went away. Every job is now defined
-- ONCE in `internal_cron_jobs`, dispatched by `internal_cron_call()`, and reports back through
-- `job_heartbeats` (written by the API) so a stalled job is visible and alertable.
--
-- PREREQUISITE: app_settings must hold `cron_api_url` and `cron_secret`
-- (run: npx ts-node apps/api/src/scripts/setup_internal_cron.ts <api base url>). This migration refuses to
-- run without them, so the legacy edge-function jobs are never removed before their replacement works.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'cron_api_url')
       OR NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'cron_secret') THEN
        RAISE EXCEPTION 'app_settings.cron_api_url / cron_secret missing - run setup_internal_cron.ts first';
    END IF;
END $$;

-- 1. Registry: one row per scheduled job ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_cron_jobs (
    job                       TEXT PRIMARY KEY,
    path                      TEXT NOT NULL,                 -- API path, relative to cron_api_url
    schedule                  TEXT NOT NULL,                 -- pg_cron expression
    timeout_ms                INTEGER NOT NULL DEFAULT 55000,
    skip_if_running           BOOLEAN NOT NULL DEFAULT TRUE, -- don't stack a run on top of one still in flight
    expected_interval_seconds INTEGER NOT NULL,              -- staleness threshold = max(2.5x this, 180s)
    active                    BOOLEAN NOT NULL DEFAULT TRUE,
    note                      TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Heartbeats: written by the API (middleware/cronHeartbeat.ts) ---------------------------------
CREATE TABLE IF NOT EXISTS public.job_heartbeats (
    job              TEXT PRIMARY KEY,
    last_started_at  TIMESTAMPTZ,
    last_finished_at TIMESTAMPTZ,
    last_success_at  TIMESTAMPTZ,
    last_status      INTEGER,
    last_error       TEXT,
    last_duration_ms INTEGER
);

-- Service-role only (RLS on, no policies) - same model as the rest of the platform tables.
ALTER TABLE public.internal_cron_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_heartbeats ENABLE ROW LEVEL SECURITY;

INSERT INTO public.internal_cron_jobs (job, path, schedule, timeout_ms, skip_if_running, expected_interval_seconds, active, note) VALUES
  ('poll-processing',   '/requisitions/poll-processing',  '* * * * *',    30000, TRUE,   60,     TRUE,  'Confirms/reverts payouts still PROCESSING at Lenco'),
  ('lenco-sync',        '/lenco/sync',                    '*/5 * * * *',  55000, TRUE,   300,    TRUE,  'Incremental Lenco transaction sync + ledger guardian cycle'),
  ('masterfees-sync',   '/integrations/masterfees/sync-all', '* * * * *', 55000, TRUE,   60,     TRUE,  'MasterFees payments sync'),
  ('automations-tick',  '/automations/tick',              '* * * * *',    55000, TRUE,   60,     TRUE,  'Automations + scheduled items'),
  ('auto-complete',     '/cron/auto-sweep',               '0 * * * *',    55000, TRUE,   3600,   TRUE,  'Reminder at 12h, auto-categorise at 24h (capped per run)'),
  ('heal-platform-fees','/cron/heal-fees',                '17 */6 * * *', 55000, TRUE,   21600,  TRUE,  'Posts missing platform fees'),
  ('invoice-reminders', '/invoices/tick',                 '0 7 * * *',    55000, FALSE,  86400,  TRUE,  'Daily invoice follow-ups'),
  ('weekly-highlights', '/ai/highlights/weekly-email',    '0 5 * * 1',    55000, FALSE,  604800, TRUE,  'Monday 05:00 UTC'),
  ('billing-tick',      '/billing/tick',                  '0 6 * * *',    55000, FALSE,  86400,  FALSE, 'NOT enabled: never scheduled before; charges wallets - enable deliberately'),
  ('cron-watchdog',     '/cron/watchdog',                 '*/10 * * * *', 30000, TRUE,   600,    TRUE,  'Emails super-admins when any job goes stale')
ON CONFLICT (job) DO UPDATE SET
    path = EXCLUDED.path, schedule = EXCLUDED.schedule, timeout_ms = EXCLUDED.timeout_ms,
    skip_if_running = EXCLUDED.skip_if_running, expected_interval_seconds = EXCLUDED.expected_interval_seconds,
    note = EXCLUDED.note;   -- `active` is deliberately NOT overwritten: an operator's toggle survives re-runs

-- 3. Dispatcher -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_cron_call(p_job TEXT) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    j   public.internal_cron_jobs%ROWTYPE;
    hb  public.job_heartbeats%ROWTYPE;
    base TEXT;
    sec  TEXT;
    req_id BIGINT;
BEGIN
    SELECT * INTO j FROM public.internal_cron_jobs WHERE job = p_job AND active;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT value #>> '{}' INTO base FROM public.app_settings WHERE key = 'cron_api_url';
    SELECT value #>> '{}' INTO sec  FROM public.app_settings WHERE key = 'cron_secret';
    IF base IS NULL OR sec IS NULL OR sec = '' THEN
        RAISE WARNING 'internal_cron_call(%): cron_api_url/cron_secret not configured', p_job;
        RETURN NULL;
    END IF;

    -- Overlap guard: a run still in flight (started, not finished, <2 min old) means skip this tick.
    -- The 2-minute cap keeps a run killed by the platform from blocking the job forever.
    IF j.skip_if_running THEN
        SELECT * INTO hb FROM public.job_heartbeats WHERE job = p_job;
        IF FOUND AND hb.last_started_at IS NOT NULL
           AND (hb.last_finished_at IS NULL OR hb.last_finished_at < hb.last_started_at)
           AND hb.last_started_at > NOW() - INTERVAL '2 minutes' THEN
            RETURN NULL;
        END IF;
    END IF;

    SELECT net.http_post(
        url     := rtrim(base, '/') || j.path,
        headers := jsonb_build_object(
                       'Content-Type', 'application/json',
                       'Authorization', 'Bearer ' || sec,
                       'X-Cron-Job', p_job),
        body    := '{}'::jsonb,
        timeout_milliseconds := j.timeout_ms
    ) INTO req_id;
    RETURN req_id;
END $$;

REVOKE ALL ON FUNCTION public.internal_cron_call(TEXT) FROM PUBLIC, anon, authenticated;

-- 4. Health view (read by GET /admin/cron-health and the watchdog) -----------------------------------
CREATE OR REPLACE FUNCTION public.cron_health() RETURNS TABLE (
    job TEXT, path TEXT, schedule TEXT, active BOOLEAN, expected_interval_seconds INTEGER, note TEXT,
    last_started_at TIMESTAMPTZ, last_finished_at TIMESTAMPTZ, last_success_at TIMESTAMPTZ,
    last_status INTEGER, last_error TEXT, last_duration_ms INTEGER,
    last_dispatch_at TIMESTAMPTZ, last_dispatch_status TEXT, stale BOOLEAN
) LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
    SELECT j.job, j.path, j.schedule, j.active, j.expected_interval_seconds, j.note,
           h.last_started_at, h.last_finished_at, h.last_success_at, h.last_status, h.last_error, h.last_duration_ms,
           d.start_time, d.status,
           (j.active AND COALESCE(h.last_success_at, j.created_at)
                < NOW() - make_interval(secs => GREATEST(j.expected_interval_seconds * 2.5, 180))) AS stale
    FROM public.internal_cron_jobs j
    LEFT JOIN public.job_heartbeats h ON h.job = j.job
    LEFT JOIN LATERAL (
        SELECT r.start_time, r.status
        FROM cron.job c JOIN cron.job_run_details r ON r.jobid = c.jobid
        WHERE c.jobname = 'internal:' || j.job
        ORDER BY r.start_time DESC LIMIT 1
    ) d ON TRUE
    ORDER BY j.job;
$$;

REVOKE ALL ON FUNCTION public.cron_health() FROM PUBLIC, anon, authenticated;

-- 5. Retire the legacy edge-function jobs, then schedule everything from the registry ----------------
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT jobid FROM cron.job WHERE command ILIKE '%/functions/v1/%' LOOP
        PERFORM cron.unschedule(r.jobid);
    END LOOP;

    FOR r IN SELECT job, schedule FROM public.internal_cron_jobs LOOP
        BEGIN PERFORM cron.unschedule('internal:' || r.job); EXCEPTION WHEN OTHERS THEN NULL; END;
        PERFORM cron.schedule('internal:' || r.job, r.schedule, format('SELECT public.internal_cron_call(%L)', r.job));
    END LOOP;
END $$;

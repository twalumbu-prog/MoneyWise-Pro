-- Stores Vercel Log Drain deliveries (function invocation logs) so payment-link
-- failures/timeouts can be diagnosed server-side, independent of PostHog's
-- client-side blind spot on bad connections. Service-role/API only — no direct
-- client reads, consistent with the rest of the RLS hardening pass.

CREATE TABLE IF NOT EXISTS vercel_function_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vercel_log_id TEXT UNIQUE,
    deployment_id TEXT,
    project_id TEXT,
    source TEXT,
    level TEXT,
    message TEXT,
    path TEXT,
    entrypoint TEXT,
    status_code INTEGER,
    request_id TEXT,
    environment TEXT,
    execution_region TEXT,
    vercel_timestamp TIMESTAMPTZ,
    raw JSONB,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vercel_function_logs_timestamp ON vercel_function_logs (vercel_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_vercel_function_logs_level ON vercel_function_logs (level);
CREATE INDEX IF NOT EXISTS idx_vercel_function_logs_path ON vercel_function_logs (path);
CREATE INDEX IF NOT EXISTS idx_vercel_function_logs_status_code ON vercel_function_logs (status_code);

ALTER TABLE vercel_function_logs ENABLE ROW LEVEL SECURITY;
-- No policies: service-role (used by the API) bypasses RLS entirely; there is
-- deliberately no policy granting anon/authenticated direct access.

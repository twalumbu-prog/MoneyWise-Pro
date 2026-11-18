-- Callbacks MTN sends to the Supabase edge function "mtn-callback". The function only stores them; the API reads them, re-checks the
-- payment with MTN, and marks them processed. Nothing in the body is trusted.
CREATE TABLE IF NOT EXISTS public.mtn_callbacks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product text NOT NULL DEFAULT 'general',
    method text NOT NULL DEFAULT 'POST',
    body jsonb NOT NULL DEFAULT '{}'::jsonb,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    process_error text
);
CREATE INDEX IF NOT EXISTS idx_mtn_callbacks_unprocessed ON public.mtn_callbacks (received_at) WHERE processed_at IS NULL;
ALTER TABLE public.mtn_callbacks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mtn_callbacks FROM anon, authenticated;
GRANT ALL ON public.mtn_callbacks TO service_role;

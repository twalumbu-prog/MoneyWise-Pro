-- Every MTN call that spends or moves money (airtime, data bundles, agent cash-out). One row each; the idempotency key stops a retry from doing it twice.
CREATE TABLE IF NOT EXISTS public.mtn_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('AIRTIME', 'DATA_BUNDLE', 'AGENT_WITHDRAWAL')),
    idempotency_key text NOT NULL UNIQUE,
    created_by uuid NOT NULL,
    phone text NOT NULL,
    amount numeric(14,2),
    currency text NOT NULL DEFAULT 'ZMW',
    reference text,
    status text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'SUBMITTED', 'SUCCESSFUL', 'FAILED', 'UNKNOWN')),
    mtn_transaction_id text NOT NULL UNIQUE,
    status_code text,
    status_message text,
    last_response jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mtn_operations_created ON public.mtn_operations (created_at DESC);
ALTER TABLE public.mtn_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mtn_operations FROM anon, authenticated;
GRANT ALL ON public.mtn_operations TO service_role;

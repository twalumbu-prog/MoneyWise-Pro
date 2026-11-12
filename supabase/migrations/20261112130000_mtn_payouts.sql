-- Payouts to MTN MoMo numbers through MTN's Payments API. One row per payout; the idempotency key stops a retry from paying twice.
CREATE TABLE IF NOT EXISTS public.mtn_payouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key text NOT NULL UNIQUE,
    created_by uuid NOT NULL,
    phone text NOT NULL,
    amount numeric(14,2) NOT NULL CHECK (amount > 0),
    currency text NOT NULL DEFAULT 'ZMW',
    note text,
    status text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'SUBMITTED', 'SUCCESSFUL', 'FAILED', 'UNKNOWN')),
    mtn_transaction_id text NOT NULL UNIQUE,
    status_code text,
    status_message text,
    last_response jsonb,
    callback_received_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mtn_payouts_created ON public.mtn_payouts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mtn_payouts_open ON public.mtn_payouts (status) WHERE status IN ('CREATED', 'SUBMITTED', 'UNKNOWN');
ALTER TABLE public.mtn_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mtn_payouts FROM anon, authenticated;
GRANT ALL ON public.mtn_payouts TO service_role;

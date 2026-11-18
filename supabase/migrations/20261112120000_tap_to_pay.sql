-- Tap to pay between MoneyWise users: the receiver's setting, and the short-lived "pay me" requests.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tap_receive text NOT NULL DEFAULT 'OFF';
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_tap_receive_check;
ALTER TABLE public.users ADD CONSTRAINT users_tap_receive_check CHECK (tap_receive IN ('OFF', 'CONTACTS', 'EVERYONE'));

CREATE TABLE IF NOT EXISTS public.pay_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    receiver_user_id uuid NOT NULL,
    receiver_org_id uuid,
    amount numeric(14,2),
    note text,
    kind text NOT NULL DEFAULT 'TAP' CHECK (kind IN ('TAP', 'LINK')),
    status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLAIMED', 'PAID', 'EXPIRED', 'CANCELLED')),
    expires_at timestamptz NOT NULL,
    claimed_by_user_id uuid,
    claimed_at timestamptz,
    claim_expires_at timestamptz,
    requisition_id uuid,
    paid_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pay_requests_receiver ON public.pay_requests (receiver_user_id, created_at DESC);
ALTER TABLE public.pay_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pay_requests FROM anon, authenticated;
GRANT ALL ON public.pay_requests TO service_role;

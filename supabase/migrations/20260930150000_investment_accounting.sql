-- Investor-side accounting for the Invest feature.
--
-- Each investment a MoneyWise org makes into an investment target gets an asset
-- account ("Investment – <target>") carrying the target's logo, and is posted
-- automatically:
--   * from the org's wallet:   Dr Investment / Cr Wallet
--   * paid from outside (e.g. Airtel Money): Dr Wallet / Cr Owner's Capital, then
--                              Dr Investment / Cr Wallet  (wallet nets to zero)
-- `investments` is the intent/confirmation record that drives that posting.

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS logo_url TEXT;

CREATE TABLE IF NOT EXISTS public.investments (
    id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    investor_organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    investment_target_id     UUID NOT NULL REFERENCES public.investment_targets(id),
    target_organization_id   UUID NOT NULL,
    -- Lenco collection reference (mobile money) or the transfer's reference (wallet).
    reference                TEXT NOT NULL,
    method                   TEXT NOT NULL CHECK (method IN ('WALLET', 'MOBILE_MONEY')),
    amount_paid              NUMERIC(15, 2) NOT NULL CHECK (amount_paid > 0),
    -- What actually reached the target's wallet; the asset is booked at this value.
    amount_received          NUMERIC(15, 2),
    fee_amount               NUMERIC(15, 2) NOT NULL DEFAULT 0,
    status                   TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED')),
    account_id               UUID,
    failure_reason           TEXT,
    created_by               UUID NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at             TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_investments_reference ON public.investments (reference);
CREATE INDEX IF NOT EXISTS idx_investments_investor ON public.investments (investor_organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_investments_pending ON public.investments (status) WHERE status = 'PENDING';

-- RLS on, no policies: only the API (service role) touches this table.
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;

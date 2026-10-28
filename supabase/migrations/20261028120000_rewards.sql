-- Customer rewards: points a person earns with the businesses they buy from (and for inviting friends), grouped per business.
-- organization_id NULL in the ledger = MoneyWise itself (platform referrals). Service-role access only (RLS on, no policies).

CREATE TABLE IF NOT EXISTS public.reward_programs (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    points_per_kwacha NUMERIC(10,4) NOT NULL DEFAULT 1,
    reward_threshold INT NOT NULL DEFAULT 500,
    reward_title TEXT NOT NULL DEFAULT 'K25 off your next purchase',
    reward_value NUMERIC(14,2) NOT NULL DEFAULT 25,
    referral_points INT NOT NULL DEFAULT 100,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reward_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    points INT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('PURCHASE', 'REFERRAL', 'BONUS', 'REDEMPTION')),
    description TEXT,
    ref TEXT NOT NULL,
    amount NUMERIC(14,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One row per earning event, so syncing the same purchase twice can never pay it twice.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reward_ledger_user_ref ON public.reward_ledger(user_id, ref);
CREATE INDEX IF NOT EXISTS idx_reward_ledger_user_org ON public.reward_ledger(user_id, organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.reward_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    points INT NOT NULL,
    title TEXT NOT NULL,
    value NUMERIC(14,2) NOT NULL DEFAULT 0,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'USED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_at TIMESTAMPTZ,
    used_by UUID
);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user ON public.reward_redemptions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_org ON public.reward_redemptions(organization_id, status);

CREATE TABLE IF NOT EXISTS public.reward_codes (
    user_id UUID PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reward_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_user_id UUID NOT NULL,
    referred_user_id UUID NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REWARDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rewarded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reward_referrals_referrer ON public.reward_referrals(referrer_user_id);

-- A friend invited to a business's pay page: remember the invite code and who paid, so the inviter can be rewarded.
ALTER TABLE public.quick_link_payments ADD COLUMN IF NOT EXISTS payer_phone TEXT;
ALTER TABLE public.quick_link_payments ADD COLUMN IF NOT EXISTS referral_code TEXT;
CREATE INDEX IF NOT EXISTS idx_quick_link_payments_payer_phone ON public.quick_link_payments(payer_phone);
CREATE INDEX IF NOT EXISTS idx_quick_link_payments_referral ON public.quick_link_payments(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_links_customer_phone ON public.payment_links(customer_phone);

ALTER TABLE public.reward_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_referrals ENABLE ROW LEVEL SECURITY;

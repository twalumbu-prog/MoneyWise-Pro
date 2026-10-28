-- Rewards a business defines for its customers: what they cost in points, what they give (money off, percent off or a free item) and
-- which products they apply to (none selected = the whole shop). Service-role access only (RLS on, no policies).
CREATE TABLE IF NOT EXISTS public.reward_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    reward_type TEXT NOT NULL CHECK (reward_type IN ('AMOUNT_OFF', 'PERCENT_OFF', 'FREE_ITEM')),
    value NUMERIC(14,2) NOT NULL DEFAULT 0,
    points_cost INT NOT NULL CHECK (points_cost > 0),
    product_ids UUID[] NOT NULL DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reward_items_org ON public.reward_items(organization_id, active);
ALTER TABLE public.reward_items ENABLE ROW LEVEL SECURITY;

-- A voucher remembers which reward it came from and what it applies to, as they were when it was redeemed.
ALTER TABLE public.reward_redemptions ADD COLUMN IF NOT EXISTS reward_id UUID;
ALTER TABLE public.reward_redemptions ADD COLUMN IF NOT EXISTS reward_type TEXT;
ALTER TABLE public.reward_redemptions ADD COLUMN IF NOT EXISTS product_names TEXT;

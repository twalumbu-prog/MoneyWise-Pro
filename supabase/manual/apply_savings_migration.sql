-- Savings: wishlist items, savings goals and group savings.
--
-- Every savings item is backed by a real MoneyWise sub-wallet (organization_wallets) plus
-- its own ASSET account (subtype 'Savings'). The ledger already maps a sub-wallet to the
-- asset account with the same name, so moving money in or out is an ordinary wallet
-- transfer and each savings pot shows up in Reporting as a savings account.
--
-- Group savings: the creator's organization holds the wallet; other MoneyWise users join
-- with an invite code and contribute (by mobile money, collected straight into that wallet).
--
-- Access model matches the rest of the API-only tables: RLS on, no policies.

CREATE TABLE IF NOT EXISTS public.savings_goals (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    wallet_id       UUID NOT NULL REFERENCES public.organization_wallets(id) ON DELETE CASCADE,
    account_id      UUID,
    kind            TEXT NOT NULL CHECK (kind IN ('WISHLIST', 'GOAL', 'GROUP')),
    name            TEXT NOT NULL,
    target_amount   NUMERIC(15, 2) CHECK (target_amount IS NULL OR target_amount > 0),
    image_url       TEXT,
    invite_code     TEXT UNIQUE,
    status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_savings_goals_org ON public.savings_goals (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.savings_group_members (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    goal_id         UUID NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    organization_id UUID,
    display_name    TEXT,
    role            TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'MEMBER')),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (goal_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_savings_members_user ON public.savings_group_members (user_id);

CREATE TABLE IF NOT EXISTS public.savings_contributions (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    goal_id      UUID NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL,
    display_name TEXT,
    amount       NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    method       TEXT NOT NULL CHECK (method IN ('WALLET', 'MOBILE_MONEY')),
    reference    TEXT NOT NULL UNIQUE,
    status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_savings_contrib_goal ON public.savings_contributions (goal_id, created_at DESC);

ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_contributions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

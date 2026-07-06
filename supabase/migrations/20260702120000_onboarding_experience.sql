-- ============================================================================
-- Guided Onboarding Experience
--
-- New structures backing the post-registration onboarding wizard:
--   1. business_profiles   — industries, store categories, contact + address
--   2. wallet_pool         — pre-created Lenco payment accounts awaiting linking
--   3. onboarding_progress — per-organization wizard state (resume support)
--   4. app_settings        — configurable platform settings (activation amount)
--   5. claim_pool_wallet() — transactional, concurrency-safe wallet assignment
--
-- All new tables are service-role only (RLS enabled, no policies): the web app
-- talks to them exclusively through the API, matching the hardened RLS model.
-- ============================================================================

-- 1. Business profile: one row per organization -------------------------------
CREATE TABLE IF NOT EXISTS public.business_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Step 2 + Step 6
    industries TEXT[] NOT NULL DEFAULT '{}',
    store_categories TEXT[] NOT NULL DEFAULT '{}',

    -- Step 4: contact
    phone VARCHAR(50),
    alt_phone VARCHAR(50),
    business_email VARCHAR(255),
    website VARCHAR(255),
    social_links JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Step 5: address
    country VARCHAR(100),
    province VARCHAR(100),
    city VARCHAR(100),
    plot_number VARCHAR(100),
    street VARCHAR(255),
    postal_code VARCHAR(50),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_profiles_org ON public.business_profiles(organization_id);

-- 2. Wallet pool: pre-created payment accounts --------------------------------
-- Onboarding NEVER creates provider accounts. Administrators pre-provision
-- Lenco accounts into this pool; activation links the oldest AVAILABLE one.
-- A wallet belongs to at most one organization, forever (linked_organization_id
-- is UNIQUE and is never cleared when a wallet is disabled).
CREATE TABLE IF NOT EXISTS public.wallet_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_account_id VARCHAR(255) NOT NULL UNIQUE,
    api_secret TEXT NOT NULL,
    public_key TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'LINKED', 'DISABLED')),
    linked_organization_id UUID UNIQUE REFERENCES public.organizations(id) ON DELETE SET NULL,
    linked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A LINKED wallet must always know its organization.
    CONSTRAINT wallet_pool_linked_requires_org
        CHECK (status <> 'LINKED' OR linked_organization_id IS NOT NULL)
);

-- Fast "oldest available" lookup for the claim RPC.
CREATE INDEX IF NOT EXISTS idx_wallet_pool_available
    ON public.wallet_pool (created_at)
    WHERE status = 'AVAILABLE';

-- 3. Onboarding progress: wizard state per organization -----------------------
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    current_step INT NOT NULL DEFAULT 1,
    completed_steps INT[] NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS'
        CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    coa_saved BOOLEAN NOT NULL DEFAULT FALSE,
    wallet_activated BOOLEAN NOT NULL DEFAULT FALSE,
    wallet_activation_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Organizations that predate the wizard are grandfathered in as COMPLETED so
-- they are never bounced into onboarding.
INSERT INTO public.onboarding_progress
    (organization_id, current_step, completed_steps, status, coa_saved, wallet_activated, completed_at)
SELECT id, 11, '{1,2,3,4,5,6,7,8,9,10}', 'COMPLETED', TRUE, TRUE, NOW()
FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

-- 4. App settings: configurable platform values -------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_settings (key, value, description) VALUES (
    'wallet_activation_amount',
    '{"amount": 50, "currency": "ZMW"}',
    'Deposit required to activate a newly linked wallet during onboarding. The deposit is credited to the organization''s own wallet — it is not a fee.'
) ON CONFLICT (key) DO NOTHING;

-- 5. Transactional wallet claim ------------------------------------------------
-- Assigns the oldest AVAILABLE pool wallet to an organization. Concurrency-safe:
-- the row is locked (FOR UPDATE SKIP LOCKED) so two simultaneous onboardings can
-- never claim the same wallet. Idempotent: an organization that already holds a
-- wallet gets that same wallet back. Returns no row when the pool is exhausted.
-- The api_secret is intentionally NOT returned.
CREATE OR REPLACE FUNCTION public.claim_pool_wallet(p_organization_id UUID)
RETURNS TABLE (
    wallet_id UUID,
    provider_account_id VARCHAR,
    public_key TEXT,
    status VARCHAR,
    linked_at TIMESTAMPTZ,
    already_linked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet public.wallet_pool%ROWTYPE;
BEGIN
    -- Idempotency: re-claiming returns the wallet already linked to this org.
    SELECT * INTO v_wallet
    FROM public.wallet_pool w
    WHERE w.linked_organization_id = p_organization_id
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT v_wallet.id, v_wallet.provider_account_id, v_wallet.public_key,
                            v_wallet.status, v_wallet.linked_at, TRUE;
        RETURN;
    END IF;

    -- Oldest AVAILABLE wallet, row-locked so concurrent claims skip past it.
    SELECT * INTO v_wallet
    FROM public.wallet_pool w
    WHERE w.status = 'AVAILABLE'
    ORDER BY w.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN; -- pool exhausted → empty result
    END IF;

    UPDATE public.wallet_pool w
    SET status = 'LINKED',
        linked_organization_id = p_organization_id,
        linked_at = NOW()
    WHERE w.id = v_wallet.id;

    -- Copy provider credentials onto the organization so every existing payment
    -- flow (checkout, verification, ledger sync) works unchanged.
    UPDATE public.organizations o
    SET lenco_subaccount_id = v_wallet.provider_account_id,
        lenco_public_key = v_wallet.public_key,
        lenco_secret_key = v_wallet.api_secret,
        updated_at = NOW()
    WHERE o.id = p_organization_id;

    RETURN QUERY SELECT v_wallet.id, v_wallet.provider_account_id, v_wallet.public_key,
                        'LINKED'::VARCHAR, NOW()::TIMESTAMPTZ, FALSE;
END;
$$;

-- Service-role / postgres only — never callable from the client roles.
REVOKE ALL ON FUNCTION public.claim_pool_wallet(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_pool_wallet(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.claim_pool_wallet(UUID) FROM authenticated;

-- 6. RLS: service-role only ----------------------------------------------------
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.business_profiles TO service_role;
GRANT ALL ON public.wallet_pool TO service_role;
GRANT ALL ON public.onboarding_progress TO service_role;
GRANT ALL ON public.app_settings TO service_role;

NOTIFY pgrst, 'reload schema';

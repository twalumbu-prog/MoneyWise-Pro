-- ============================================================
-- MoneyWise Subscription & Billing
-- ============================================================
-- Plans:  free (1 member, K0) | premium (unlimited, K250/month)
-- Pricing: K250 base, reduced by platform fees earned that period.
--          If fees ≥ K250 → subscription fully paid for that month.
-- ============================================================

-- 1. Plans catalogue
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id              text PRIMARY KEY,
    name            text NOT NULL,
    price_zmw       numeric(10,2) NOT NULL DEFAULT 0,
    max_members     integer,          -- NULL = unlimited
    features        jsonb DEFAULT '{}'::jsonb,
    created_at      timestamptz DEFAULT now()
);

INSERT INTO public.subscription_plans (id, name, price_zmw, max_members, features) VALUES
    ('free',    'Free',    0,   1,    '{"team": false, "products": true, "payment_links": true}'),
    ('premium', 'Premium', 250, NULL, '{"team": true,  "products": true, "payment_links": true}')
ON CONFLICT (id) DO NOTHING;

-- 2. Per-org subscription state (one row per org)
CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
    id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id       uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id               text NOT NULL DEFAULT 'free' REFERENCES public.subscription_plans(id),
    status                text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'past_due', 'cancelled')),
    current_period_start  date NOT NULL DEFAULT CURRENT_DATE,
    current_period_end    date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '1 month')::date,
    fee_credits_zmw       numeric(10,2) NOT NULL DEFAULT 0,  -- accumulated this period
    auto_pay_enabled      boolean NOT NULL DEFAULT true,
    created_at            timestamptz DEFAULT now(),
    updated_at            timestamptz DEFAULT now()
);

-- 3. Audit trail: each platform fee credited toward subscription
CREATE TABLE IF NOT EXISTS public.subscription_fee_credits (
    id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    subscription_id  uuid NOT NULL REFERENCES public.organization_subscriptions(id) ON DELETE CASCADE,
    amount_zmw       numeric(10,2) NOT NULL,
    reference        text NOT NULL,          -- payment / transfer reference
    source_type      text NOT NULL DEFAULT 'PAYMENT_LINK'
                         CHECK (source_type IN ('PAYMENT_LINK', 'QUICK_LINK', 'DIRECT_DEPOSIT', 'OTHER')),
    created_at       timestamptz DEFAULT now(),
    UNIQUE (reference)                       -- one credit per swept reference
);

-- 4. Monthly invoices
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
    id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    subscription_id  uuid NOT NULL REFERENCES public.organization_subscriptions(id) ON DELETE CASCADE,
    invoice_number   text NOT NULL UNIQUE,   -- INV-YYYYMM-XXXXXX
    period_start     date NOT NULL,
    period_end       date NOT NULL,
    gross_zmw        numeric(10,2) NOT NULL DEFAULT 250,
    credits_zmw      numeric(10,2) NOT NULL DEFAULT 0,
    net_zmw          numeric(10,2) NOT NULL,   -- max(0, gross - credits)
    status           text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'paid', 'voided', 'free')),
    due_date         date NOT NULL,
    paid_at          timestamptz,
    paid_via         text,                   -- 'wallet_auto' | 'lenco_collection' | 'manual'
    lenco_reference  text,
    created_at       timestamptz DEFAULT now()
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_org_sub_org    ON public.organization_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_sub_credits_org ON public.subscription_fee_credits(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_org ON public.subscription_invoices(organization_id, created_at DESC);

-- 6. Auto-provision free subscription for every existing org that lacks one
INSERT INTO public.organization_subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
SELECT o.id, 'free', 'active', CURRENT_DATE, (CURRENT_DATE + INTERVAL '1 month')::date
FROM   public.organizations o
WHERE  NOT EXISTS (
    SELECT 1 FROM public.organization_subscriptions s WHERE s.organization_id = o.id
)
ON CONFLICT DO NOTHING;

-- 7. Trigger: auto-provision subscription for new orgs
CREATE OR REPLACE FUNCTION public.provision_subscription_for_new_org()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.organization_subscriptions (organization_id)
    VALUES (NEW.id)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_subscription ON public.organizations;
CREATE TRIGGER trg_provision_subscription
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.provision_subscription_for_new_org();

-- 8. RLS
ALTER TABLE public.subscription_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_fee_credits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_invoices       ENABLE ROW LEVEL SECURITY;

-- service_role gets full access (API uses service role)
GRANT ALL ON public.subscription_plans          TO service_role;
GRANT ALL ON public.organization_subscriptions  TO service_role;
GRANT ALL ON public.subscription_fee_credits    TO service_role;
GRANT ALL ON public.subscription_invoices       TO service_role;

-- anon/authenticated: read plans only
CREATE POLICY "plans_public_read" ON public.subscription_plans
    FOR SELECT TO anon, authenticated USING (true);

-- org members see only their own subscription
CREATE POLICY "sub_org_read" ON public.organization_subscriptions
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "sub_credits_org_read" ON public.subscription_fee_credits
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "sub_invoices_org_read" ON public.subscription_invoices
    FOR SELECT TO authenticated USING (true);

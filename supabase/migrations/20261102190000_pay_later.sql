-- Pay in 4: a buyer who qualifies from their MoneyWise history splits a Marketplace order into four interest-free instalments.
-- MoneyWise pays the seller in full up front and collects the instalments (see apps/api/src/services/payLater.service.ts).
-- Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.pay_later_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
    buyer_user_id   UUID NOT NULL,
    buyer_org_id    UUID NOT NULL,
    seller_org_id   UUID NOT NULL,
    description     TEXT NOT NULL,
    principal       NUMERIC(14,2) NOT NULL,
    status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'DEFAULTED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    defaulted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pay_later_plans_buyer ON public.pay_later_plans (buyer_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pay_later_instalments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id          UUID NOT NULL REFERENCES public.pay_later_plans(id) ON DELETE CASCADE,
    seq              INTEGER NOT NULL CHECK (seq BETWEEN 1 AND 4),
    amount           NUMERIC(14,2) NOT NULL,
    due_date         DATE NOT NULL,
    status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'LATE')),
    late_fee         NUMERIC(14,2) NOT NULL DEFAULT 0,
    paid_at          TIMESTAMPTZ,
    payment_reference TEXT,
    reminder_sent_at TIMESTAMPTZ,
    processing_at    TIMESTAMPTZ,
    UNIQUE (plan_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_pay_later_instalments_due ON public.pay_later_instalments (status, due_date);

ALTER TABLE public.pay_later_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_later_instalments ENABLE ROW LEVEL SECURITY;

-- Marketplace orders: a buyer pays a seller from their MoneyWise wallet (MoneyWise Pay, no fee) inside the app.
--  * One row per purchase, with the delivery choice, the amounts, where it is in fulfilment, and any dispute.
--  * An auction that is won but not paid within its payment window is marked unpaid and the winner gets a strike.
-- Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.marketplace_orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name        TEXT NOT NULL,
    seller_org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    buyer_user_id       UUID NOT NULL,
    buyer_org_id        UUID,
    buyer_name          TEXT NOT NULL,
    buyer_phone         TEXT,
    auction_id          UUID REFERENCES public.marketplace_auctions(id) ON DELETE SET NULL,
    quantity            INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price          NUMERIC(14,2) NOT NULL,
    item_total          NUMERIC(14,2) NOT NULL,
    delivery_method     TEXT NOT NULL DEFAULT 'PICKUP' CHECK (delivery_method IN ('PICKUP', 'SELLER', 'OPUS')),
    delivery_fee        NUMERIC(14,2) NOT NULL DEFAULT 0,
    delivery_area       TEXT,
    delivery_address    TEXT,
    delivery_notes      TEXT,
    total               NUMERIC(14,2) NOT NULL,
    payment_method      TEXT NOT NULL DEFAULT 'MONEYWISE_PAY',
    status              TEXT NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (status IN
                          ('PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'DISPUTED', 'FAILED')),
    requisition_id      UUID,
    payment_reference   TEXT,
    idempotency_key     TEXT UNIQUE,
    dispute_reason      TEXT,
    dispute_opened_at   TIMESTAMPTZ,
    dispute_response    TEXT,
    dispute_resolved_at TIMESTAMPTZ,
    status_before_dispute TEXT,
    paid_at             TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_buyer ON public.marketplace_orders (buyer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_seller ON public.marketplace_orders (seller_org_id, created_at DESC);
-- A won auction can be paid once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_orders_auction_paid ON public.marketplace_orders (auction_id)
    WHERE auction_id IS NOT NULL AND status NOT IN ('FAILED', 'PENDING_PAYMENT');

ALTER TABLE public.marketplace_auctions ADD COLUMN IF NOT EXISTS unpaid_at TIMESTAMPTZ;
ALTER TABLE public.marketplace_auctions ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.marketplace_strikes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    auction_id  UUID REFERENCES public.marketplace_auctions(id) ON DELETE SET NULL,
    reason      TEXT NOT NULL DEFAULT 'AUCTION_NOT_PAID',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, auction_id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_strikes_user ON public.marketplace_strikes (user_id);

ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_strikes ENABLE ROW LEVEL SECURITY;

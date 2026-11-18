-- Requests for quote: a buyer asks for a price ("500 hollow blocks delivered to Kabwe by Friday"), suppliers reply with quotes, the buyer accepts one.
-- A quote from a MoneyWise supplier becomes a private one-off listing at the quoted price, so it is paid through the normal checkout with
-- buyer protection. Additive only. Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.rfq_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference         TEXT NOT NULL UNIQUE,
    buyer_org_id      UUID NOT NULL,
    buyer_user_id     UUID NOT NULL,
    buyer_name        TEXT,
    buyer_phone       TEXT,
    catalog_item_id   UUID REFERENCES public.catalog_items(id) ON DELETE SET NULL,
    title             TEXT NOT NULL,
    details           TEXT,
    quantity          NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
    unit              TEXT NOT NULL,
    delivery_town     TEXT,
    delivery_province TEXT,
    delivery_address  TEXT,
    needed_by         DATE,
    status            TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','AWARDED','CLOSED','CANCELLED','EXPIRED')),
    expires_at        TIMESTAMPTZ NOT NULL,
    awarded_quote_id  UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rfq_requests_buyer ON public.rfq_requests (buyer_org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfq_requests_open ON public.rfq_requests (status, expires_at) WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS public.rfq_quotes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id         UUID NOT NULL REFERENCES public.rfq_requests(id) ON DELETE CASCADE,
    supplier_org_id UUID,                            -- the MoneyWise business, or null when the team entered a quote taken by phone
    supplier_name  TEXT NOT NULL,
    supplier_phone TEXT,
    unit_price     NUMERIC(14,2) NOT NULL CHECK (unit_price > 0),
    quantity       NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
    delivery_fee   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    total          NUMERIC(14,2) NOT NULL CHECK (total > 0),
    delivers       BOOLEAN NOT NULL DEFAULT FALSE,
    valid_until    DATE,
    note           TEXT,
    status         TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','ACCEPTED','DECLINED','WITHDRAWN')),
    product_id     UUID REFERENCES public.products(id) ON DELETE SET NULL,     -- the private listing made when the quote is accepted
    price_point_id UUID REFERENCES public.price_points(id) ON DELETE SET NULL, -- the price record this quote added to the comparison
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rfq_quotes_rfq ON public.rfq_quotes (rfq_id, status);
-- A MoneyWise supplier has one quote per request (it can be changed until accepted).
CREATE UNIQUE INDEX IF NOT EXISTS uq_rfq_quotes_supplier ON public.rfq_quotes (rfq_id, supplier_org_id) WHERE supplier_org_id IS NOT NULL;

ALTER TABLE public.rfq_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_quotes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.rfq_requests, public.rfq_quotes TO service_role;

NOTIFY pgrst, 'reload config';

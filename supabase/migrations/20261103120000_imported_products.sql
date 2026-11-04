-- Imported products: items from overseas stores (eBay, AliExpress and others) shown in the Marketplace with prices in kwacha, bought on the
-- customer's behalf by MoneyWise and tracked until they arrive. Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.imported_products (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source            TEXT NOT NULL DEFAULT 'MANUAL',          -- MANUAL, EBAY, ALIEXPRESS ...
    source_id         TEXT,                                    -- the item's id at the source (for refreshing it)
    source_url        TEXT,
    title             TEXT NOT NULL,
    description       TEXT,
    images            JSONB NOT NULL DEFAULT '[]'::jsonb,
    category          TEXT,
    origin            TEXT,                                    -- where it ships from: USA, China, South Africa ...
    price             NUMERIC(14, 2) NOT NULL CHECK (price >= 0),     -- one item, in `currency`
    currency          TEXT NOT NULL DEFAULT 'USD',
    shipping_price    NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (shipping_price >= 0),  -- international shipping per item, in `currency` (0 = worked out from weight)
    weight_kg         NUMERIC(8, 3),
    delivery_days_min INTEGER NOT NULL DEFAULT 14,
    delivery_days_max INTEGER NOT NULL DEFAULT 28,
    options           JSONB NOT NULL DEFAULT '[]'::jsonb,      -- [{ "name": "Colour", "values": ["Black", "White"] }]
    is_active         BOOLEAN NOT NULL DEFAULT true,           -- false when the source no longer has it
    listed            BOOLEAN NOT NULL DEFAULT true,           -- shown in browse; links pasted by customers stay unlisted until a team member lists them
    views             INTEGER NOT NULL DEFAULT 0,
    last_refreshed_at TIMESTAMPTZ,
    refresh_error     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_imported_products_source ON public.imported_products (source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_imported_products_browse ON public.imported_products (is_active, listed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imported_products_refresh ON public.imported_products (last_refreshed_at NULLS FIRST) WHERE source <> 'MANUAL';

-- Exchange rates, fees and the other numbers behind a price, editable by the team.
CREATE TABLE IF NOT EXISTS public.import_settings (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.import_settings (key, value) VALUES
    ('fx', '{"USD": 27, "EUR": 29, "GBP": 34, "ZAR": 1.5, "CNY": 3.7, "ZMW": 1}'::jsonb),
    ('pricing', '{"feePercent": 10, "minFee": 30, "dutyPercent": 15, "vatPercent": 16, "shippingPerKgUsd": 12}'::jsonb),
    ('feeds', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.import_orders (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id         UUID REFERENCES public.imported_products(id) ON DELETE SET NULL,
    buyer_user_id      UUID NOT NULL,
    buyer_org_id       UUID,
    buyer_name         TEXT NOT NULL,
    buyer_phone        TEXT,
    title              TEXT NOT NULL,
    image_url          TEXT,
    source             TEXT,
    source_url         TEXT,
    quantity           INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    option_note        TEXT,                                   -- colour, size and so on, as the buyer typed it
    unit_price         NUMERIC(14, 2),
    currency           TEXT,
    fx_rate            NUMERIC(12, 4),
    item_zmw           NUMERIC(14, 2) NOT NULL DEFAULT 0,
    shipping_zmw       NUMERIC(14, 2) NOT NULL DEFAULT 0,
    taxes_zmw          NUMERIC(14, 2) NOT NULL DEFAULT 0,
    fee_zmw            NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_zmw          NUMERIC(14, 2) NOT NULL,
    delivery_area      TEXT,
    delivery_address   TEXT,
    notes              TEXT,
    status             TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
                       CHECK (status IN ('PENDING_PAYMENT','PAYMENT_PROCESSING','PAID','ORDERED','SHIPPED','IN_TRANSIT','CUSTOMS','IN_LUSAKA','DELIVERED','CANCELLED','REFUNDED','FAILED')),
    supplier_order_ref TEXT,
    tracking_number    TEXT,
    carrier            TEXT,
    events             JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{ "at": "...", "status": "SHIPPED", "note": "..." }]
    payment_reference  TEXT,
    requisition_id     UUID,
    paid_at            TIMESTAMPTZ,
    refund_reference   TEXT,
    refunded_at        TIMESTAMPTZ,
    idempotency_key    TEXT UNIQUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_orders_buyer ON public.import_orders (buyer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_orders_status ON public.import_orders (status, created_at DESC);

-- Only the API (service role) reads and writes these.
ALTER TABLE public.imported_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_orders ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.imported_products, public.import_settings, public.import_orders TO service_role;

NOTIFY pgrst, 'reload config';

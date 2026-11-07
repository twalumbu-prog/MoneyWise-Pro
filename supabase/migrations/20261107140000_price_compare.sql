-- Price comparison: a shared product catalogue ("Cement 50 kg bag"), so the same product from different sellers and stores can be compared,
-- and price records from places that are not MoneyWise sellers (a depot's price list, a supermarket shelf, a shopper's report, a quote).
-- Additive only. Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.catalog_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,                       -- "Cement 50 kg bag"
    category    TEXT NOT NULL,                       -- "Cement"
    vertical    TEXT NOT NULL DEFAULT 'CONSTRUCTION',-- CONSTRUCTION, GROCERY, ...
    unit        TEXT NOT NULL,                       -- what one price is for: bag, piece, tonne, metre, litre, kg, sheet, roll, load
    unit_detail TEXT,                                -- "50 kg"
    brand       TEXT,
    keywords    TEXT,                                -- extra search words
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_catalog_items_category ON public.catalog_items (vertical, category) WHERE is_active;

-- A seller's listing says which catalogue item it is, so it shows up in that item's comparison.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS catalog_item_id UUID REFERENCES public.catalog_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_catalog_item ON public.products (catalog_item_id) WHERE catalog_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.price_points (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_item_id UUID NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
    source_type     TEXT NOT NULL DEFAULT 'SUPPLIER_LIST' CHECK (source_type IN ('SUPPLIER_LIST','SHOPPER_REPORT','RFQ_QUOTE','BUSINESS_AGGREGATE')),
    place_name      TEXT NOT NULL,                   -- "Chilanga Cement depot" or "ShopRite Garden City"
    town            TEXT,
    province        TEXT,
    address         TEXT,
    phone           TEXT,
    org_id          UUID,                            -- the MoneyWise business, when the place is one
    price           NUMERIC(14,2) NOT NULL CHECK (price > 0),   -- for one `unit` of the catalogue item
    min_qty         INTEGER,                         -- the price applies from this quantity (bulk price)
    delivers        BOOLEAN NOT NULL DEFAULT FALSE,
    delivery_note   TEXT,
    observed_on     DATE NOT NULL DEFAULT CURRENT_DATE,
    status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PENDING','REJECTED','EXPIRED')),
    trust           TEXT NOT NULL DEFAULT 'ENTERED' CHECK (trust IN ('ENTERED','VERIFIED')),
    evidence_url    TEXT,                            -- a photo of the price tag or receipt
    reported_by     UUID,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_points_item ON public.price_points (catalog_item_id, status, observed_on DESC);
CREATE INDEX IF NOT EXISTS idx_price_points_town ON public.price_points (town);

-- Only the API (service role) reads and writes these.
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_points ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.catalog_items, public.price_points TO service_role;

NOTIFY pgrst, 'reload config';

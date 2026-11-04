-- Real fund prices: each investment company (an investment_target) lists its funds and sends a price (NAV per unit) with a date.
-- Charts, the "last updated" line and what an investor's holding is worth all come from these rows, never from a formula.
-- Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.fund_products (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investment_target_id UUID NOT NULL REFERENCES public.investment_targets(id) ON DELETE CASCADE,
    key                  TEXT NOT NULL,                       -- short stable name, e.g. equity-fund
    name                 TEXT NOT NULL,                       -- what investors see; an investment's product_name matches this
    kind                 TEXT NOT NULL DEFAULT 'UNIT_TRUST' CHECK (kind IN ('UNIT_TRUST','MONEY_MARKET','BOND','FIXED_DEPOSIT','OTHER')),
    currency             TEXT NOT NULL DEFAULT 'ZMW',
    frequency            TEXT NOT NULL DEFAULT 'DAILY' CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY','QUARTERLY')),
    min_deposit          NUMERIC(14, 2),
    risk                 TEXT,
    description          TEXT,
    is_active            BOOLEAN NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (investment_target_id, key)
);

CREATE TABLE IF NOT EXISTS public.fund_prices (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fund_id    UUID NOT NULL REFERENCES public.fund_products(id) ON DELETE CASCADE,
    as_of      DATE NOT NULL,                                 -- the day the price is for
    nav        NUMERIC(18, 6) NOT NULL CHECK (nav > 0),        -- price of one unit
    source     TEXT NOT NULL DEFAULT 'MANAGER',               -- MANAGER (sent by the company), FACTSHEET or WEBSITE (read from a published page)
    note       TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (fund_id, as_of)
);
CREATE INDEX IF NOT EXISTS idx_fund_prices_fund_date ON public.fund_prices (fund_id, as_of DESC);

-- Only the API (service role) reads and writes these.
ALTER TABLE public.fund_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_prices ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.fund_products, public.fund_prices TO service_role;

NOTIFY pgrst, 'reload config';

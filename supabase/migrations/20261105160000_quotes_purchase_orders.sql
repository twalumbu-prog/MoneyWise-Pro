-- Quotes (offers to customers that can become invoices) and purchase orders (orders to suppliers that become bills when the goods arrive).
-- Neither touches the books until they turn into an invoice or a bill. Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.quotes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    quote_number    TEXT NOT NULL,
    customer_id     UUID,
    customer_name   TEXT NOT NULL,
    customer_phone  TEXT,
    customer_email  TEXT,
    issue_date      DATE NOT NULL,
    valid_until     DATE NOT NULL,
    items           JSONB NOT NULL DEFAULT '[]'::jsonb,   -- in the same shape an invoice's lines are created from
    total           NUMERIC(14,2) NOT NULL CHECK (total > 0),
    status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACCEPTED','DECLINED','INVOICED','CANCELLED')),
    invoice_id      UUID,
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, quote_number)
);
CREATE INDEX IF NOT EXISTS idx_quotes_org ON public.quotes (organization_id, issue_date DESC);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    supplier_id     UUID NOT NULL REFERENCES public.suppliers(id),
    po_number       TEXT NOT NULL,
    order_date      DATE NOT NULL,
    expected_date   DATE,
    status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PART_RECEIVED','RECEIVED','CANCELLED')),
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, po_number)
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org ON public.purchase_orders (organization_id, status);

CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id        UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id   UUID,
    variant_id   TEXT,
    account_id   UUID,
    description  TEXT NOT NULL,
    quantity     INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost    NUMERIC(14,2) NOT NULL CHECK (unit_cost >= 0),
    tax_code     TEXT,
    received_qty INTEGER NOT NULL DEFAULT 0 CHECK (received_qty >= 0)
);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po ON public.purchase_order_lines (po_id);
ALTER TABLE public.purchase_bills ADD COLUMN IF NOT EXISTS purchase_order_id UUID;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.quotes, public.purchase_orders, public.purchase_order_lines TO service_role;
NOTIFY pgrst, 'reload config';

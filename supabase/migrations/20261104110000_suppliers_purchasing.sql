-- Suppliers, purchase bills and a stock movement history. Enterprise plan. Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.suppliers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL,
    name               TEXT NOT NULL,
    contact_person     TEXT,
    phone              TEXT,
    email              TEXT,
    address            TEXT,
    tax_number         TEXT,                          -- the supplier's TPIN
    payment_terms_days INTEGER NOT NULL DEFAULT 30,
    notes              TEXT,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_org ON public.suppliers (organization_id);

CREATE TABLE IF NOT EXISTS public.purchase_bills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    supplier_id     UUID NOT NULL REFERENCES public.suppliers(id),
    bill_number     TEXT,
    bill_date       DATE NOT NULL,
    due_date        DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIAL','PAID','VOID')),
    total           NUMERIC(14,2) NOT NULL CHECK (total >= 0),
    amount_paid     NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_org ON public.purchase_bills (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_supplier ON public.purchase_bills (supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_bills_number ON public.purchase_bills (organization_id, supplier_id, bill_number) WHERE bill_number IS NOT NULL AND status <> 'VOID';

CREATE TABLE IF NOT EXISTS public.purchase_bill_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id     UUID NOT NULL REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
    product_id  UUID,                                  -- set when the line is stock that goes into inventory
    account_id  UUID,                                  -- the expense account when the line is not stock
    description TEXT NOT NULL,
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost   NUMERIC(14,2) NOT NULL CHECK (unit_cost >= 0),
    line_total  NUMERIC(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_bill_lines_bill ON public.purchase_bill_lines (bill_id);

CREATE TABLE IF NOT EXISTS public.bill_payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    bill_id         UUID NOT NULL REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    paid_on         DATE NOT NULL,
    method          TEXT,
    reference       TEXT,
    account_id      UUID NOT NULL,                     -- the bank, cash or wallet account the money left
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bill_payments_bill ON public.bill_payments (bill_id);

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    product_id      UUID NOT NULL,
    quantity_change INTEGER NOT NULL,
    unit_cost       NUMERIC(14,2),
    reason          TEXT NOT NULL CHECK (reason IN ('PURCHASE','ADJUSTMENT','COUNT','SALE','RETURN','VOID')),
    ref_type        TEXT,
    ref_id          UUID,
    note            TEXT,
    balance_after   INTEGER,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements (organization_id, product_id, created_at DESC);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14,2);

-- The ledger only accepts known entry types. Add the ones the accounting import and purchasing post.
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
    CHECK (source_type = ANY (ARRAY['CASHBOOK','LINE_ITEMS','OPENING','MANUAL','RECLASS','MASTERFEES','INVOICE','IMPORT','PURCHASE_BILL','BILL_PAYMENT','STOCK_ADJUSTMENT']));

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.suppliers, public.purchase_bills, public.purchase_bill_lines, public.bill_payments, public.stock_movements TO service_role;
NOTIFY pgrst, 'reload config';

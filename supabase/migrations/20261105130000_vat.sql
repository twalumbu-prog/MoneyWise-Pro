-- VAT: settings per business, a record of every VAT amount charged or paid, and filed returns. Keep in step with the inline migration in apps/api/src/index.ts.

ALTER TABLE public.accounting_settings ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.accounting_settings ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 16;
ALTER TABLE public.accounting_settings ADD COLUMN IF NOT EXISTS tpin TEXT;
ALTER TABLE public.accounting_settings ADD COLUMN IF NOT EXISTS vat_number TEXT;

ALTER TABLE public.customer_invoices ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_bills ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_bill_lines ADD COLUMN IF NOT EXISTS tax_code TEXT;
ALTER TABLE public.purchase_bill_lines ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

-- One row per VAT amount: OUTPUT is VAT charged to customers, INPUT is VAT paid to suppliers.
CREATE TABLE IF NOT EXISTS public.vat_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    direction       TEXT NOT NULL CHECK (direction IN ('OUTPUT','INPUT')),
    tax_code        TEXT NOT NULL CHECK (tax_code IN ('STANDARD','ZERO','EXEMPT')),
    tx_date         DATE NOT NULL,
    net             NUMERIC(14,2) NOT NULL,
    vat             NUMERIC(14,2) NOT NULL DEFAULT 0,
    source_type     TEXT NOT NULL,                      -- INVOICE, PURCHASE_BILL, or MANUAL
    source_id       UUID NOT NULL,
    counterparty    TEXT,
    reference       TEXT,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vat_tx_org_date ON public.vat_transactions (organization_id, tx_date);
CREATE INDEX IF NOT EXISTS idx_vat_tx_source ON public.vat_transactions (organization_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS public.vat_returns (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL,
    period_start      DATE NOT NULL,
    period_end        DATE NOT NULL,
    totals            JSONB NOT NULL,                   -- the figures as they stood when it was filed
    payment_reference TEXT,
    filed_by          UUID,
    filed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, period_start, period_end)
);

ALTER TABLE public.vat_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_returns ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.vat_transactions, public.vat_returns TO service_role;
NOTIFY pgrst, 'reload config';

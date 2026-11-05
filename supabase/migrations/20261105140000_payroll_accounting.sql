-- Payroll in the books: accruing each approved run (gross pay, employer contributions, and what is owed to ZRA, NAPSA and NHIMA),
-- and recording the payments made to them. Keep in step with the inline migration in apps/api/src/index.ts.

-- A date turns accruals on from that day. Runs approved before it are not touched: their pay was already booked another way.
ALTER TABLE public.accounting_settings ADD COLUMN IF NOT EXISTS payroll_accrual_from DATE;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS accrued_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.statutory_payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    agency          TEXT NOT NULL CHECK (agency IN ('PAYE','NAPSA','NHIMA')),
    period_year     INTEGER NOT NULL,
    period_month    INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    paid_on         DATE NOT NULL,
    method          TEXT,
    reference       TEXT,
    account_id      UUID,                              -- the bank or wallet account the money left, when it was posted to the books
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_statutory_payments_period ON public.statutory_payments (organization_id, period_year, period_month);
ALTER TABLE public.statutory_payments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.statutory_payments TO service_role;

ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
    CHECK (source_type = ANY (ARRAY['CASHBOOK','LINE_ITEMS','OPENING','MANUAL','RECLASS','MASTERFEES','INVOICE','IMPORT','PURCHASE_BILL','BILL_PAYMENT','STOCK_ADJUSTMENT','STOCK_SALE','PAYROLL_RUN','STATUTORY_PAYMENT']));
NOTIFY pgrst, 'reload config';

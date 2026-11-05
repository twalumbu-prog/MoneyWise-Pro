-- Credit notes: a customer credit note takes money off what a customer owes (a return, a discount, a mistake), and a supplier credit
-- note takes money off what you owe a supplier. Either can be applied to an invoice or bill, or kept as credit.
-- Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.credit_notes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    direction      TEXT NOT NULL CHECK (direction IN ('CUSTOMER','SUPPLIER')),
    note_number    TEXT NOT NULL,
    customer_id    UUID,
    supplier_id    UUID,
    party_name     TEXT NOT NULL,
    invoice_id     UUID,                              -- the invoice a customer credit note is against
    bill_id        UUID,                              -- the bill a supplier credit note is against
    issue_date     DATE NOT NULL,
    reason         TEXT,
    items          JSONB NOT NULL DEFAULT '[]'::jsonb,
    net            NUMERIC(14,2) NOT NULL,
    vat_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    total          NUMERIC(14,2) NOT NULL CHECK (total > 0),
    amount_applied NUMERIC(14,2) NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','APPLIED','VOID')),
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, direction, note_number)
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_org ON public.credit_notes (organization_id, direction, issue_date DESC);
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.credit_notes TO service_role;

-- A credit applied to an invoice is one more row in invoice_payments (the invoice's paid amount is the sum of that table),
-- but it has no cashbook entry behind it.
ALTER TABLE public.invoice_payments ALTER COLUMN cashbook_entry_id DROP NOT NULL;
ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS credit_note_id UUID REFERENCES public.credit_notes(id) ON DELETE CASCADE;
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS credit_note_id UUID REFERENCES public.credit_notes(id) ON DELETE CASCADE;

ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
    CHECK (source_type = ANY (ARRAY['CASHBOOK','LINE_ITEMS','OPENING','MANUAL','RECLASS','MASTERFEES','INVOICE','IMPORT','PURCHASE_BILL','BILL_PAYMENT','STOCK_ADJUSTMENT','STOCK_SALE','PAYROLL_RUN','STATUTORY_PAYMENT','CREDIT_NOTE']));
NOTIFY pgrst, 'reload config';

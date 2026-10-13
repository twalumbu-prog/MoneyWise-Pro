-- =============================================================================
-- Credit sales: customer invoices + payment allocation
-- =============================================================================
-- A credit sale ("invoice") recognises revenue now and leaves the cash to arrive later:
--     Dr Accounts Receivable   Cr Income          (journal source_type = 'INVOICE')
-- When the customer pays, the money lands in a wallet as a normal INFLOW. Classifying that inflow to
-- Accounts Receivable already posts Dr Wallet / Cr Accounts Receivable through the cashbook posting
-- engine; `invoice_payments` records WHICH customer invoice(s) that inflow settles, so each invoice
-- carries a live balance and the AR account always equals the sum of open invoice balances.
--
-- Additive + idempotent. The tables are API/service-role only (RLS on, no policies) like the rest.
-- =============================================================================

-- 0. The CRM `customers` table. 20260928120000_add_crm_feature.sql was never applied to production (the CRM ran on
--    customers derived from sales), and invoices need a real customer row to belong to. Same columns, but RLS is ON
--    with NO policy: customers are read/written only through the API (service role) — the original migration's
--    `USING (true)` policy would have exposed every organisation's customers to any signed-in user.
CREATE TABLE IF NOT EXISTS public.customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    notes           TEXT,
    status          TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_org_id ON public.customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.customers TO service_role;

-- 1. Let the GL accept invoice journals (the CHECK list was widened for MASTERFEES the same way).
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries
    ADD CONSTRAINT journal_entries_source_type_check
    CHECK (source_type IN ('CASHBOOK','LINE_ITEMS','OPENING','MANUAL','RECLASS','MASTERFEES','INVOICE'));

-- 2. Invoices
CREATE TABLE IF NOT EXISTS public.customer_invoices (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_number        text NOT NULL,
    customer_id           uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name         text NOT NULL,
    customer_phone        text,
    customer_email        text,
    issue_date            date NOT NULL DEFAULT CURRENT_DATE,
    follow_up_date        date NOT NULL,
    -- [{ product_id?, name, quantity, unit_price, income_account_id?, check_in?, check_out?, custom? }]
    items                 jsonb NOT NULL DEFAULT '[]'::jsonb,
    total                 numeric(14,2) NOT NULL CHECK (total > 0),
    amount_paid           numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    status                text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIAL','PAID','VOID')),
    notes                 text,
    reference             text,
    receivable_account_id uuid REFERENCES public.accounts(id),
    last_sent_at          timestamptz,
    sent_count            integer NOT NULL DEFAULT 0,
    created_by            uuid REFERENCES public.users(id),
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    voided_at             timestamptz,
    last_reminder_at      timestamptz,
    reminder_count        integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_customer_invoice_number
    ON public.customer_invoices (organization_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_org_status
    ON public.customer_invoices (organization_id, status, follow_up_date);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_customer
    ON public.customer_invoices (customer_id) WHERE customer_id IS NOT NULL;

-- 3. Which cash inflow settles which invoice (an inflow can be split across several invoices).
CREATE TABLE IF NOT EXISTS public.invoice_payments (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id        uuid NOT NULL REFERENCES public.customer_invoices(id) ON DELETE CASCADE,
    cashbook_entry_id uuid NOT NULL REFERENCES public.cashbook_entries(id) ON DELETE CASCADE,
    amount            numeric(14,2) NOT NULL CHECK (amount > 0),
    applied_by        uuid REFERENCES public.users(id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (invoice_id, cashbook_entry_id)
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_entry ON public.invoice_payments (cashbook_entry_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON public.invoice_payments (invoice_id);

ALTER TABLE public.customer_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

-- 4. Invoice balance is always DERIVED from its payment rows (so deleting an entry, re-classifying it, or
--    re-applying it can never leave a stale amount_paid behind).
CREATE OR REPLACE FUNCTION public.refresh_customer_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_paid  numeric;
    v_total numeric;
    v_state text;
BEGIN
    SELECT total, status INTO v_total, v_state FROM public.customer_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.invoice_payments WHERE invoice_id = p_invoice_id;
    IF v_paid > v_total + 0.005 THEN
        RAISE EXCEPTION 'Payments (%) exceed the invoice total (%)', v_paid, v_total USING ERRCODE = '23514';
    END IF;
    UPDATE public.customer_invoices
       SET amount_paid = v_paid,
           status = CASE
                      WHEN v_state = 'VOID' THEN 'VOID'
                      WHEN v_paid >= v_total - 0.005 THEN 'PAID'
                      WHEN v_paid > 0 THEN 'PARTIAL'
                      ELSE 'OPEN'
                    END,
           updated_at = now()
     WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_invoice_payments_refresh()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.refresh_customer_invoice(OLD.invoice_id);
        RETURN OLD;
    END IF;
    PERFORM public.refresh_customer_invoice(NEW.invoice_id);
    IF TG_OP = 'UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
        PERFORM public.refresh_customer_invoice(OLD.invoice_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_payments_refresh ON public.invoice_payments;
CREATE TRIGGER trg_invoice_payments_refresh
    AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
    FOR EACH ROW EXECUTE FUNCTION public.trg_invoice_payments_refresh();

-- 5. Per-organisation invoice numbers (INV-0001, INV-0002 …), race-safe via an advisory lock.
CREATE OR REPLACE FUNCTION public.next_customer_invoice_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_next integer;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('customer_invoice_number:' || p_org_id::text, 0));
    SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::integer), 0) + 1
      INTO v_next
      FROM public.customer_invoices
     WHERE organization_id = p_org_id;
    RETURN 'INV-' || lpad(v_next::text, 4, '0');
END;
$$;

-- 6. A pay-by-link link can belong to a credit invoice: when it is paid, the inflow is applied to the invoice
--    (not re-booked as new revenue).
ALTER TABLE public.payment_links
    ADD COLUMN IF NOT EXISTS credit_invoice_id uuid REFERENCES public.customer_invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payment_links_credit_invoice
    ON public.payment_links (credit_invoice_id) WHERE credit_invoice_id IS NOT NULL;

NOTIFY pgrst, 'reload config';

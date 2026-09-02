-- Links the "Master Fees Collections (Lenco)" local GL account to its real
-- QuickBooks bank account ("Master-fees", id 1150040065 at Twalumbu), and adds
-- an audit table recording every QuickBooks Payment we create from a
-- reconciled Master Fees cashbook entry — one row per (cashbook_entry_id,
-- QB customer/student), since a single guardian payment can cover several
-- children and QuickBooks Payments can only carry one CustomerRef each.
-- Existence of a row here is also the idempotency check before posting again.

UPDATE public.accounts
SET qb_account_id = '1150040065'
WHERE code = 'QB-MF-CASH' AND qb_account_id IS NULL;

CREATE TABLE IF NOT EXISTS public.masterfees_qb_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id),
    cashbook_entry_id uuid NOT NULL REFERENCES public.cashbook_entries(id),
    qb_customer_id text NOT NULL,
    qb_customer_name text,
    qb_payment_id text NOT NULL,
    amount numeric NOT NULL,
    qb_invoice_ids text[] NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cashbook_entry_id, qb_customer_id)
);

ALTER TABLE public.masterfees_qb_payments ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload config';

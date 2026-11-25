-- Debt tracking for personal workspaces: who you owe and who owes you. A transaction is tagged as part of a debt (loan received, repayment made, ...);
-- the tag moves it out of income/expense into a debt ledger account, and a debt's balance is the total of its tagged transactions.
CREATE TABLE IF NOT EXISTS public.debts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    side                TEXT NOT NULL CHECK (side IN ('OWE', 'OWED')),            -- OWE: I owe them. OWED: they owe me.
    counterparty_type   TEXT NOT NULL DEFAULT 'PERSON' CHECK (counterparty_type IN ('PERSON', 'COMPANY')),
    counterparty_name   TEXT NOT NULL,
    counterparty_org_id UUID,                                                      -- when it is another MoneyWise workspace (a company the person also belongs to)
    due_date            DATE,
    note                TEXT,
    created_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_debts_party ON public.debts (organization_id, side, lower(counterparty_name));
CREATE INDEX IF NOT EXISTS idx_debts_org ON public.debts (organization_id);
CREATE INDEX IF NOT EXISTS idx_debts_counterparty_org ON public.debts (counterparty_org_id) WHERE counterparty_org_id IS NOT NULL;

ALTER TABLE public.cashbook_entries ADD COLUMN IF NOT EXISTS debt_id UUID;
ALTER TABLE public.cashbook_entries ADD COLUMN IF NOT EXISTS debt_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_cashbook_debt ON public.cashbook_entries (debt_id) WHERE debt_id IS NOT NULL;

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.debts TO service_role;
NOTIFY pgrst, 'reload schema';

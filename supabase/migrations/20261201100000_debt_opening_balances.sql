-- Debts that started before the books did: an opening balance with a person or company (for example an advance a company paid out that was never recorded
-- as a transaction here). It counts toward the debt's balance and is posted to the ledger against an "Opening balance equity" account, so the books stay
-- balanced. source/source_id make an import safe to repeat.
CREATE TABLE IF NOT EXISTS public.debt_opening_balances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    debt_id         UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    as_of           DATE NOT NULL DEFAULT CURRENT_DATE,
    note            TEXT,
    source          TEXT,
    source_id       UUID,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_debt_opening_debt ON public.debt_opening_balances (debt_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_opening_source ON public.debt_opening_balances (organization_id, source, source_id) WHERE source_id IS NOT NULL;
ALTER TABLE public.debt_opening_balances ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.debt_opening_balances TO service_role;
NOTIFY pgrst, 'reload schema';

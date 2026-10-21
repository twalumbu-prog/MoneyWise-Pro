-- Raw lines of a bank's own statement (e.g. Zanaco) for an external wallet, imported through the API.
-- Deliberately separate from cashbook_entries: statement lines are evidence to reconcile the ledger
-- against, never accounting entries, so importing a statement cannot double-count or move any balance.
-- Statement orientation: money_in / money_out are from the account holder's point of view.

CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seq                BIGINT GENERATED ALWAYS AS IDENTITY,     -- stable import order within a date
    organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    external_wallet_id UUID NOT NULL REFERENCES public.external_wallets(id) ON DELETE CASCADE,
    line_date          DATE NOT NULL,
    description        TEXT NOT NULL DEFAULT '',
    reference          TEXT,
    money_in           NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (money_in >= 0),
    money_out          NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (money_out >= 0),
    balance            NUMERIC(15, 2),                          -- the statement's running balance after this line
    line_hash          TEXT NOT NULL,                           -- makes re-importing the same statement a no-op
    import_batch_id    UUID NOT NULL,                           -- lets a bad import be undone as a unit
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (external_wallet_id, line_hash)
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_wallet_date ON public.bank_statement_lines (external_wallet_id, line_date DESC, seq DESC);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_batch ON public.bank_statement_lines (import_batch_id);

-- API (service role) only: no policies, so anon/authenticated are denied.
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- Public API transfers (POST /api/v1/transfers): links a sale paid into an external account (Airtel Money / cash / bank)
-- to the MoneyWise-wallet deposit that moved that money, by posting the external-account side of the transfer.
--
-- One row per wallet deposit (a deposit can be transferred once) and per sale (a sale is moved once). The row is
-- claimed (PENDING) BEFORE any ledger entry is written, so concurrent or retried requests cannot book it twice —
-- the same claim-first pattern as api_sales. Service-role only (RLS on, no policies).

CREATE TABLE IF NOT EXISTS public.api_transfers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    deposit_entry_id        UUID NOT NULL,
    sale_external_reference TEXT NOT NULL,
    source_account_type     TEXT,
    status                  TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    gross_amount            NUMERIC(14, 2),
    net_amount              NUMERIC(14, 2),
    fee_amount              NUMERIC(14, 2),
    transfer_date           DATE,
    entry_ids               UUID[] NOT NULL DEFAULT '{}',
    api_key_id              UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
    oauth_grant_id          UUID REFERENCES public.oauth_grants(id) ON DELETE SET NULL,
    error                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ,
    CONSTRAINT api_transfers_org_deposit_key UNIQUE (organization_id, deposit_entry_id),
    CONSTRAINT api_transfers_org_sale_key UNIQUE (organization_id, sale_external_reference)
);

ALTER TABLE public.api_transfers ENABLE ROW LEVEL SECURITY;

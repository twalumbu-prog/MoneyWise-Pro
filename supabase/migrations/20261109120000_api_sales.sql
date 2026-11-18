-- Public API sales (POST /api/v1/sales): one row per caller-supplied external_reference per organization.
--
-- The row is claimed (status PENDING) BEFORE the sale is booked; the unique (organization_id, external_reference)
-- constraint makes concurrent retries race-safe — only one request can claim a reference, the others read the
-- existing row and answer 200 "created": false. It also records which API key / OAuth client created the sale
-- (cashbook_entries.created_by is a users.id FK, so it cannot hold an API key or OAuth grant).
--
-- Service-role only (RLS on, no policies), like the rest of the public-API tables.

CREATE TABLE IF NOT EXISTS public.api_sales (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    external_reference TEXT NOT NULL CHECK (char_length(external_reference) BETWEEN 1 AND 120),
    status             TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    sale_date          DATE,
    amount             NUMERIC(14, 2),
    account_type       TEXT,
    receipt_number     TEXT,
    entry_ids          UUID[] NOT NULL DEFAULT '{}',
    api_key_id         UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
    oauth_grant_id     UUID REFERENCES public.oauth_grants(id) ON DELETE SET NULL,
    error              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at       TIMESTAMPTZ,
    CONSTRAINT api_sales_org_external_reference_key UNIQUE (organization_id, external_reference)
);

ALTER TABLE public.api_sales ENABLE ROW LEVEL SECURITY;

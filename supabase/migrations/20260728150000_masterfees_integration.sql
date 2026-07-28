-- Master Fees integration
--
-- Master Fees (sibling Blue Opus product for schools) exposes a read-only REST API
-- for invoices, payments and balances. This integration pulls that activity into
-- MoneyWise's GL: invoices recognise school-fee revenue + a "Master Fees Receivables"
-- asset (accrual), and payments clear the receivable. See
-- apps/api/src/services/masterfees.service.ts.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Harden the `integrations` table for multi-org, multi-provider use.
--    The original QuickBooks migration made `provider` GLOBALLY unique, which
--    blocks two organizations from ever using the same provider. Scope it per org.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Drop the legacy provider-only unique constraint if it still exists (name is the
-- Postgres default for a column-level UNIQUE: <table>_<column>_key).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.integrations'::regclass
          AND conname = 'integrations_provider_key'
    ) THEN
        ALTER TABLE public.integrations DROP CONSTRAINT integrations_provider_key;
    END IF;
END $$;

-- One row per (organization, provider).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_integrations_org_provider
  ON public.integrations (organization_id, provider);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. `masterfees_records` — audit + idempotency ledger mapping each Master Fees
--    invoice/payment to the MoneyWise journal (and, in the shared-Lenco case, to
--    the reclassified cashbook inflow). The UNIQUE key makes re-syncing safe.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.masterfees_records (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    integration_id    UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
    record_type       VARCHAR(20) NOT NULL CHECK (record_type IN ('INVOICE', 'PAYMENT')),
    mf_id             TEXT NOT NULL,          -- Master Fees invoice_id / transaction_id
    mf_reference      TEXT,                   -- invoice_number / payment reference
    mf_invoice_id     TEXT,                   -- for PAYMENTs: the invoice they settle (if known)
    student_name      TEXT,
    grade             TEXT,
    fee_category_id   TEXT,
    amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
    mf_status         TEXT,
    journal_entry_id  UUID,                   -- GL journal posted for this record
    cashbook_entry_id UUID,                   -- shared-Lenco: the reclassified inflow
    external_reference TEXT,                  -- Lenco/txn reference used for dedup
    raw               JSONB DEFAULT '{}'::jsonb,
    synced_at         TIMESTAMPTZ DEFAULT NOW(),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uniq_masterfees_record UNIQUE (organization_id, record_type, mf_id)
);

CREATE INDEX IF NOT EXISTS idx_masterfees_records_org        ON public.masterfees_records (organization_id);
CREATE INDEX IF NOT EXISTS idx_masterfees_records_invoice    ON public.masterfees_records (organization_id, mf_invoice_id);
CREATE INDEX IF NOT EXISTS idx_masterfees_records_extref     ON public.masterfees_records (external_reference);

-- RLS: admin-scoped, mirroring the `integrations` policies. The API uses the
-- service role (bypasses RLS); these guard any direct client access.
ALTER TABLE public.masterfees_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'masterfees_records' AND policyname = 'Admins manage masterfees records') THEN
        DROP POLICY "Admins manage masterfees records" ON public.masterfees_records;
    END IF;
END $$;

CREATE POLICY "Admins manage masterfees records" ON public.masterfees_records
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role = 'ADMIN'
          AND u.organization_id = masterfees_records.organization_id
    )
);

GRANT ALL ON public.masterfees_records TO service_role;
GRANT SELECT ON public.masterfees_records TO authenticated;

NOTIFY pgrst, 'reload config';

-- Investor accounts: a customer's account with an investment company.
--
-- Before someone can invest in a company (an investment_target) they must have
-- an account with it. They either CONNECT an existing account number or
-- REGISTER: an onboarding application whose details + documents are rendered to
-- a PDF, emailed to the company, and shown in the company's CRM (Investors tab)
-- where staff review it, set the status and issue the account number.
--
-- Access model matches investment_targets: RLS on, no policies. Only the API
-- (service role) reads or writes these tables. Documents live in the private
-- `investor-kyc` bucket; the API hands out short-lived signed URLs.

-- ── Investment targets: catalog link + onboarding config ─────────────────────
ALTER TABLE public.investment_targets
    -- Links a real company to a demo catalog provider in the app (longhorn, hobbiton…)
    -- so the catalog's products render against the real wallet.
    ADD COLUMN IF NOT EXISTS provider_key TEXT,
    ADD COLUMN IF NOT EXISTS requires_account BOOLEAN NOT NULL DEFAULT TRUE,
    -- Names offered in the "Sales Person" picker of the application form.
    ADD COLUMN IF NOT EXISTS sales_people JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS fund_fact_sheet_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_investment_targets_provider_key
    ON public.investment_targets (provider_key) WHERE provider_key IS NOT NULL;

-- ── Organizations: where investor deposits are forwarded ─────────────────────
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS payout_bank_code TEXT,
    ADD COLUMN IF NOT EXISTS payout_bank_name TEXT,
    ADD COLUMN IF NOT EXISTS payout_branch TEXT,
    ADD COLUMN IF NOT EXISTS payout_account_number TEXT,
    ADD COLUMN IF NOT EXISTS payout_account_name TEXT,
    ADD COLUMN IF NOT EXISTS forward_investor_deposits BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Investor accounts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.investor_accounts (
    id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    investor_organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    investment_target_id     UUID NOT NULL REFERENCES public.investment_targets(id) ON DELETE CASCADE,
    target_organization_id   UUID NOT NULL,
    user_id                  UUID NOT NULL,
    -- REGISTERED = went through the application; CONNECTED = typed an existing number.
    source                   TEXT NOT NULL CHECK (source IN ('REGISTERED', 'CONNECTED')),
    status                   TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
        CHECK (status IN ('PENDING_REVIEW', 'INFO_REQUESTED', 'ACTIVE', 'REJECTED', 'SUSPENDED')),
    account_number           TEXT,
    -- Full application as submitted (see mobile InvestApplicationForm).
    applicant                JSONB,
    -- { nrc_front, nrc_back, nrc_combined, photo, proof_of_residence, reference_letter, proof_of_income } → storage paths
    documents                JSONB,
    declaration_accepted_at  TIMESTAMPTZ,
    pdf_path                 TEXT,
    email_sent_at            TIMESTAMPTZ,
    email_error              TEXT,
    review_note              TEXT,
    reviewed_by              UUID,
    reviewed_at              TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live account per investor per company; a rejected one can be re-applied for.
CREATE UNIQUE INDEX IF NOT EXISTS uq_investor_accounts_live
    ON public.investor_accounts (investor_organization_id, investment_target_id)
    WHERE status <> 'REJECTED';

-- An account number identifies exactly one active investor at a company.
CREATE UNIQUE INDEX IF NOT EXISTS uq_investor_accounts_number
    ON public.investor_accounts (investment_target_id, lower(account_number))
    WHERE account_number IS NOT NULL AND status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_investor_accounts_target
    ON public.investor_accounts (target_organization_id, status, created_at DESC);

ALTER TABLE public.investor_accounts ENABLE ROW LEVEL SECURITY;

-- ── Investments: who invested, into which product ────────────────────────────
ALTER TABLE public.investments
    ADD COLUMN IF NOT EXISTS investor_account_id UUID REFERENCES public.investor_accounts(id),
    ADD COLUMN IF NOT EXISTS investor_account_number TEXT,
    ADD COLUMN IF NOT EXISTS product_name TEXT;

-- ── Private bucket for application documents ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('investor-kyc', 'investor-kyc', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "investor-kyc upload own folder" ON storage.objects;
CREATE POLICY "investor-kyc upload own folder" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'investor-kyc'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

NOTIFY pgrst, 'reload config';

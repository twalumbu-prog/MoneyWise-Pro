-- Loans tab: microfinance lenders offer loan products inside MoneyWise, and borrowers apply with their consent.
-- First lender: FMC Finance. The product terms below are PLACEHOLDERS (terms_confirmed = false) until the lender confirms them.

CREATE TABLE IF NOT EXISTS public.loan_lenders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    description   TEXT,
    logo_url      TEXT,
    contact_email TEXT,                                  -- where new applications are sent, until the lender has a screen of its own
    active        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loan_products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lender_id       UUID NOT NULL REFERENCES public.loan_lenders(id) ON DELETE CASCADE,
    slug            TEXT NOT NULL,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL CHECK (kind IN ('WORKING_CAPITAL','ASSET_FINANCE','SALARY_ADVANCE','PERSONAL')),
    audience        TEXT NOT NULL DEFAULT 'BUSINESS' CHECK (audience IN ('BUSINESS','STAFF')),
    description     TEXT,
    min_amount      NUMERIC(14, 2),
    max_amount      NUMERIC(14, 2),
    min_months      INTEGER,
    max_months      INTEGER,
    indicative_rate NUMERIC(6, 2),                       -- per month, in percent, when the lender has published one
    requirements    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- what the lender will ask for, as short lines
    terms_confirmed BOOLEAN NOT NULL DEFAULT false,      -- false: amounts, terms and rates are placeholders, shown as "to be confirmed"
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (lender_id, slug)
);

CREATE TABLE IF NOT EXISTS public.loan_applications (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    applicant_user_id UUID NOT NULL,
    applicant_name   TEXT,
    lender_id        UUID NOT NULL REFERENCES public.loan_lenders(id),
    product_id       UUID NOT NULL REFERENCES public.loan_products(id),
    amount           NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    term_months      INTEGER NOT NULL CHECK (term_months > 0),
    purpose          TEXT,
    requisition_id   UUID,                               -- the approved requisition this loan is meant to fund, when there is one
    phone            TEXT,
    -- What the applicant agreed to share, when, and the figures shared at that moment (kept as evidence of exactly what the lender saw).
    consent_at       TIMESTAMPTZ NOT NULL,
    consent_scope    JSONB NOT NULL DEFAULT '[]'::jsonb,
    data_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
    status           TEXT NOT NULL DEFAULT 'SUBMITTED'
                     CHECK (status IN ('SUBMITTED','IN_REVIEW','APPROVED','DECLINED','DISBURSED','REPAID','WITHDRAWN')),
    lender_reference TEXT,
    decision_note    TEXT,
    events           JSONB NOT NULL DEFAULT '[]'::jsonb,
    idempotency_key  TEXT UNIQUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loan_applications_org ON public.loan_applications (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loan_applications_status ON public.loan_applications (status, created_at DESC);

ALTER TABLE public.loan_lenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.loan_lenders, public.loan_products, public.loan_applications TO service_role;

-- FMC Finance Zambia, with placeholder products. Replace the figures with the lender's real terms and set terms_confirmed = true.
INSERT INTO public.loan_lenders (slug, name, description) VALUES
    ('fmc-finance', 'FMC Finance', 'Bank of Zambia registered microfinance lender for SMEs and salaried people, with branches in Lusaka and Kitwe.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.loan_products (lender_id, slug, name, kind, audience, description, requirements)
SELECT l.id, p.slug, p.name, p.kind, p.audience, p.description, p.requirements::jsonb
FROM public.loan_lenders l,
     (VALUES
        ('sme-working-capital', 'SME working capital loan', 'WORKING_CAPITAL', 'BUSINESS', 'Short-term money for stock, supplies and day-to-day running costs.', '["Registered or trading business","Recent sales and cash-flow records (shared from MoneyWise with your consent)","Valid ID of the owner"]'),
        ('sme-asset-finance', 'SME asset finance', 'ASSET_FINANCE', 'BUSINESS', 'Finance for equipment and other assets the business needs to grow.', '["Quote or invoice for the asset","Recent sales and cash-flow records (shared from MoneyWise with your consent)","Valid ID of the owner"]'),
        ('salary-advance', 'Salary advance for staff', 'SALARY_ADVANCE', 'STAFF', 'An advance on pay for employees, offered through their employer as a benefit.', '["Employer agreement","Payslip or payroll record","Valid ID"]')
     ) AS p(slug, name, kind, audience, description, requirements)
WHERE l.slug = 'fmc-finance'
ON CONFLICT (lender_id, slug) DO NOTHING;

NOTIFY pgrst, 'reload config';

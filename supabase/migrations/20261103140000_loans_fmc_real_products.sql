-- FMC Finance's real products, requirements and branding (read from their public website, fmcfinancezambia.co.zm), replacing the placeholder
-- products. Also lets the lender, not the borrower, settle the repayment period: term_months becomes the borrower's preference and is optional.
-- Amounts, rates and fees are NOT published by FMC, so terms_confirmed stays false and they are shown as "set by FMC".

ALTER TABLE public.loan_lenders ADD COLUMN IF NOT EXISTS brand JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.loan_products DROP CONSTRAINT IF EXISTS loan_products_kind_check;
ALTER TABLE public.loan_products ADD CONSTRAINT loan_products_kind_check
    CHECK (kind IN ('WORKING_CAPITAL','ASSET_FINANCE','SALARY_ADVANCE','PERSONAL','BUSINESS','INVOICE_DISCOUNTING','ORDER_FINANCING'));
ALTER TABLE public.loan_products DROP CONSTRAINT IF EXISTS loan_products_audience_check;
ALTER TABLE public.loan_products ADD CONSTRAINT loan_products_audience_check CHECK (audience IN ('BUSINESS','STAFF','INDIVIDUAL'));
ALTER TABLE public.loan_products ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'::jsonb;
-- What the lender asks of an applicant, as keys MoneyWise can check against a person's saved ID and records (see loans.service.ts NEEDS).
ALTER TABLE public.loan_products ADD COLUMN IF NOT EXISTS needs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.loan_products ADD COLUMN IF NOT EXISTS tenors JSONB;

ALTER TABLE public.loan_applications ALTER COLUMN term_months DROP NOT NULL;
ALTER TABLE public.loan_applications DROP CONSTRAINT IF EXISTS loan_applications_term_months_check;
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_term_months_check CHECK (term_months IS NULL OR term_months > 0);

UPDATE public.loan_lenders SET
    logo_url = '/lenders/fmc-finance.png',
    contact_email = 'info@fmcfinancezambia.co.zm',
    description = 'Registered microfinance institution lending to salaried people, SMEs and corporates, with branches in Lusaka and Kitwe.',
    brand = '{"primary": "#0D4A1A", "primaryMid": "#166128", "primaryDark": "#093813", "primaryLight": "#F0F7F1", "secondary": "#2D2D8E", "secondaryLight": "#EEEEF8",
              "website": "https://fmcfinancezambia.co.zm", "phones": {"Lusaka": "+260 977 473 668", "Kitwe": "+260 963 611 753"}, "email": "info@fmcfinancezambia.co.zm",
              "source": "fmcfinancezambia.co.zm, read 2026-11-03"}'::jsonb
WHERE slug = 'fmc-finance';

-- The placeholder products give way to the real five.
UPDATE public.loan_products SET active = false
WHERE lender_id = (SELECT id FROM public.loan_lenders WHERE slug = 'fmc-finance') AND slug IN ('sme-working-capital', 'sme-asset-finance', 'salary-advance');

INSERT INTO public.loan_products (lender_id, slug, name, kind, audience, description, features, requirements, needs, tenors, terms_confirmed, active)
SELECT l.id, p.slug, p.name, p.kind, p.audience, p.description, p.features::jsonb, p.requirements::jsonb, p.needs::jsonb, '[3,6,12,24,36,48,60]'::jsonb, false, true
FROM public.loan_lenders l,
     (VALUES
        ('personal-loan', 'Personal loan', 'PERSONAL', 'INDIVIDUAL',
         'Flexible personal loans for individuals, from school fees and medical bills to home improvements and personal projects.',
         '["Flexible loan amounts","Competitive interest rates","Fast approval process","Flexible repayment terms"]',
         '["National ID card","Current pay slip or proof of income","Bank statement","Proof of residence"]',
         '["identity","contact","address","next_of_kin","employment","bank","id_documents","photo","proof_of_residence","payslip","bank_statement"]'),
        ('salary-advance', 'Salary advance', 'SALARY_ADVANCE', 'INDIVIDUAL',
         'Quick access to funds against your upcoming salary, for urgent needs before your next pay date. Repaid by payroll deduction.',
         '["No collateral required","Same-day processing available","Civil servants and formally employed","Payroll deduction repayment"]',
         '["National ID card","Current pay slip","Bank statement","Employer payroll arrangement"]',
         '["identity","contact","address","next_of_kin","employment","bank","id_documents","photo","payslip","bank_statement","employer_arrangement"]'),
        ('business-loan', 'Business loan', 'BUSINESS', 'BUSINESS',
         'Financing for businesses of all sizes: working capital, equipment and stock purchase, and expansion.',
         '["Working capital financing","Equipment and stock purchase","Business expansion support","Flexible repayment schedules"]',
         '["Business registration certificate","Audited financial statements","Business bank statement","Director ID and KYC"]',
         '["identity","contact","address","business","bank","id_documents","photo","bank_statement","business_registration","financial_statements"]'),
        ('invoice-discounting', 'Invoice discounting', 'INVOICE_DISCOUNTING', 'BUSINESS',
         'Unlock cash tied up in approved invoices to keep cash flowing without waiting for your debtors to pay.',
         '["Immediate cash against invoices","Improves business cash flow","SME and corporate clients","Supports business continuity"]',
         '["Approved invoice","Business registration","Bank statement","Director ID"]',
         '["identity","contact","business","bank","id_documents","bank_statement","business_registration","invoice"]'),
        ('order-financing', 'Order financing', 'ORDER_FINANCING', 'BUSINESS',
         'Finance confirmed purchase orders so you can fulfil contracts on time without tying up your own working capital.',
         '["Finance against confirmed orders","Fast cash flow release","SME and corporate clients","Supports contract fulfilment"]',
         '["Confirmed purchase order","Business registration","Bank statement","Director ID"]',
         '["identity","contact","business","bank","id_documents","bank_statement","business_registration","purchase_order"]')
     ) AS p(slug, name, kind, audience, description, features, requirements, needs)
WHERE l.slug = 'fmc-finance'
ON CONFLICT (lender_id, slug) DO UPDATE SET
    name = EXCLUDED.name, kind = EXCLUDED.kind, audience = EXCLUDED.audience, description = EXCLUDED.description, features = EXCLUDED.features,
    requirements = EXCLUDED.requirements, needs = EXCLUDED.needs, tenors = EXCLUDED.tenors, active = true;

NOTIFY pgrst, 'reload config';

-- Make an investment company investable in the app.
--
-- 1. Create the company as a normal MoneyWise organization (its own account), with:
--      * an email address on the organization (Settings → General) — investor applications are emailed there
--      * a MoneyWise wallet (the Main Wallet is fine) — investor deposits land in it
-- 2. Find the ids:
--      SELECT o.id AS organization_id, o.name, w.id AS wallet_id, w.name AS wallet
--      FROM organizations o JOIN organization_wallets w ON w.organization_id = o.id
--      WHERE o.name ILIKE '%longhorn%';
-- 3. Fill in the values below and run it in the Supabase SQL editor (production project).
--
-- provider_key links the company to the demo catalog entry shown in the app, so its
-- products (Premium FX Fund, …) now fund this real wallet. Catalog keys:
--   longhorn | hobbiton | aflife | abc
-- Use NULL for a company that isn't in the catalog (it gets one generic "Direct Investment" product).
--
-- After this, the company's admins also get:
--   * CRM → Investors tab   (applications + self-linked account numbers; they approve and issue account numbers)
--   * Settings → Investor Payouts   (the bank account deposits are forwarded to)

INSERT INTO public.investment_targets (
    organization_id, wallet_id, display_name, category, description, provider_key, sales_people, is_active
)
VALUES (
    '<ORGANIZATION_ID>',
    '<WALLET_ID>',
    'Longhorn Investment Associates',
    'Capital & Investment',
    'High-yield equity funds and diversified capital portfolios.',
    'longhorn',
    '["Sales Person One", "Sales Person Two"]'::jsonb,
    TRUE
)
ON CONFLICT (organization_id) DO UPDATE SET
    wallet_id    = EXCLUDED.wallet_id,
    display_name = EXCLUDED.display_name,
    provider_key = EXCLUDED.provider_key,
    sales_people = EXCLUDED.sales_people,
    is_active    = TRUE,
    updated_at   = now();

-- Optional: the "fund fact sheet" link shown beside the declaration in the application.
-- UPDATE public.investment_targets SET fund_fact_sheet_url = 'https://…' WHERE organization_id = '<ORGANIZATION_ID>';
--
-- Optional: let investors invest without an account (turns the gate off for this company).
-- UPDATE public.investment_targets SET requires_account = FALSE WHERE organization_id = '<ORGANIZATION_ID>';

-- Close cross-tenant RLS gaps.
--
-- Audit of the live database found 19 policies with USING(true)/CHECK(true)
-- reachable by anon or authenticated. Two distinct faults:
--
--  1. Seven policies named "service_role_all_*" (plus one legacy "Admins can
--     manage AI settings") were created WITHOUT `TO service_role`, so Postgres
--     defaulted them to PUBLIC. Combined with USING(true) that made the tables
--     world-readable to anyone holding the anon key. Verified against production
--     before this migration: an unauthenticated request with only the anon key
--     returned 44 payroll_staff rows -- every employee across every organization,
--     including salary, bank account and mobile-money details -- plus
--     payroll_run_items and scheduled_items. This was live, not theoretical.
--
--  2. Eleven policies scoped `TO authenticated` with USING(true), whose names
--     claim an "own organization" restriction they never actually expressed. Any
--     signed-in user of any tenant could read and write every other tenant's
--     wallets, payment links, products, sales and QuickBooks OAuth credentials.
--
-- Both are removed rather than rewritten with an org predicate, because no client
-- reads these tables directly. Verified across apps/web, apps/admin, apps/mobile
-- and packages/core: the only direct PostgREST access from any client is `users`
-- and `organizations` (both already org-scoped) plus Storage. Everything else
-- goes through apps/api on the service-role key, and service_role bypasses RLS
-- entirely -- which is also why the "service_role_all_*" policies were never
-- needed for the API to work.
--
-- Leaving RLS enabled with no policy denies anon and authenticated by default.
-- That is already the proven state of 33 other tables in this database
-- (requisitions, disbursements, cashbook_entries, vouchers, journal_lines...),
-- so this migration makes the exposed tables match the tables that were always
-- correct.
--
-- Deliberately NOT dropped: subscription_plans.plans_public_read. It is a public
-- price list (id, name, price_zmw, max_members, features) with no tenant data,
-- and the public read is intentional.

BEGIN;

-- 1. Policies that defaulted to PUBLIC -- readable with only the anon key.
DROP POLICY IF EXISTS "Admins can manage AI settings" ON public.ai_model_settings;
DROP POLICY IF EXISTS "service_role_all_payroll_documents" ON public.payroll_documents;
DROP POLICY IF EXISTS "service_role_all_payroll_run_items" ON public.payroll_run_items;
DROP POLICY IF EXISTS "service_role_all_payroll_runs" ON public.payroll_runs;
DROP POLICY IF EXISTS "service_role_all_payroll_staff" ON public.payroll_staff;
DROP POLICY IF EXISTS "service_role_all_scheduled_item_runs" ON public.scheduled_item_runs;
DROP POLICY IF EXISTS "service_role_all_scheduled_items" ON public.scheduled_items;

-- 2. Policies that claimed org scoping but expressed USING(true) for every
--    authenticated user, in any organization.
DROP POLICY IF EXISTS "Manage departments of own organization" ON public.departments;
DROP POLICY IF EXISTS "Allow authenticated users access to organization external walle" ON public.external_wallets;
DROP POLICY IF EXISTS "Allow authenticated users to manage integrations" ON public.integrations;
DROP POLICY IF EXISTS "Allow authenticated users to view integrations" ON public.integrations;
DROP POLICY IF EXISTS "sub_org_read" ON public.organization_subscriptions;
DROP POLICY IF EXISTS "Manage wallets of own organization" ON public.organization_wallets;
DROP POLICY IF EXISTS "Manage payment links of own organization" ON public.payment_links;
DROP POLICY IF EXISTS "Manage product bookings of own organization" ON public.product_bookings;
DROP POLICY IF EXISTS "Manage product sales of own organization" ON public.product_sales;
DROP POLICY IF EXISTS "Manage products of own organization" ON public.products;
DROP POLICY IF EXISTS "sub_credits_org_read" ON public.subscription_fee_credits;
DROP POLICY IF EXISTS "sub_invoices_org_read" ON public.subscription_invoices;

COMMIT;

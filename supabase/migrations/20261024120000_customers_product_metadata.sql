-- Blue Opus CRM: free-form per-customer metadata for product customers (MoneyWise accounts / Project Genius users):
-- plan, member counts, and the PG-SUB- payment references that attribute subscription receipts to a Project Genius user.
-- Additive and optional — the CRM sync works without it (it just omits metadata).
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_customers_org_source ON public.customers(organization_id, external_source);
NOTIFY pgrst, 'reload config';

-- SECURITY: the original policy was USING (true) for every authenticated user, so any logged-in user could read ANY org's customers through
-- the anon key — which now includes Blue Opus's cross-tenant product customers (emails of every MoneyWise / Project Genius customer).
-- Only the API (service role, bypasses RLS) touches this table, so restrict direct access to the caller's own organization.
DROP POLICY IF EXISTS "Manage customers of own organization" ON public.customers;
CREATE POLICY "Manage customers of own organization" ON public.customers
    FOR ALL
    TO authenticated
    USING (organization_id = public.current_user_org_id())
    WITH CHECK (organization_id = public.current_user_org_id());

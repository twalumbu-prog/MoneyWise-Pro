-- Lets integrations (Master Fees students) own CRM rows idempotently.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS external_source TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_external
    ON public.customers(organization_id, external_source, external_id)
    WHERE external_source IS NOT NULL;
NOTIFY pgrst, 'reload config';

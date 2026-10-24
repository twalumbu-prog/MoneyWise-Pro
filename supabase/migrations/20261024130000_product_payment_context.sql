-- References are stored upper-cased by the API.
-- Per-payment payer context pushed by Blue Opus products (Project Genius) so a PG-SUB-/PG-TEACHER- receipt can be attributed to the
-- school/teacher that paid it. Keyed on the payment reference; service-role only (RLS on, no policies).
CREATE TABLE IF NOT EXISTS public.product_payment_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product TEXT NOT NULL,
    reference TEXT NOT NULL,
    customer_external_id TEXT NOT NULL,
    amount NUMERIC(14,2),
    status TEXT NOT NULL DEFAULT 'pending',
    plan TEXT,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    payer_phone TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppc_org_reference ON public.product_payment_context(organization_id, reference);
CREATE INDEX IF NOT EXISTS idx_ppc_customer ON public.product_payment_context(organization_id, product, customer_external_id);
ALTER TABLE public.product_payment_context ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.product_payment_context TO service_role;
GRANT ALL ON public.product_payment_context TO postgres;
NOTIFY pgrst, 'reload config';

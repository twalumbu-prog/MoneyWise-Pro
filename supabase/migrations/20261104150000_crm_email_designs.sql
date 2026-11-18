-- =============================================================================
-- CRM campaign email designs
-- =============================================================================
-- Custom HTML email designs (ads/newsletters designed outside MoneyWise) that a
-- business uploads in the CRM "Email customers" composer and can reuse for
-- later campaigns. API/service-role only (RLS on, no policies) — the web app
-- reads and writes these through /crm/email-designs.
-- Additive and idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.crm_email_designs (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    html             text NOT NULL,
    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_email_designs_org
    ON public.crm_email_designs (organization_id, updated_at DESC);

ALTER TABLE public.crm_email_designs ENABLE ROW LEVEL SECURITY;

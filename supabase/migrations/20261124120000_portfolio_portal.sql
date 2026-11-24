-- Portal confirmations: the investment company's portal is the source of truth for an investor's units.
-- Keep in step with the inline migration in apps/api/src/index.ts.
ALTER TABLE public.investments
    ADD COLUMN IF NOT EXISTS units NUMERIC(18, 4),
    ADD COLUMN IF NOT EXISTS flow_code TEXT,
    ADD COLUMN IF NOT EXISTS portal_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.investment_portal_snapshots (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investor_organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    investment_target_id     UUID NOT NULL REFERENCES public.investment_targets(id) ON DELETE CASCADE,
    fund_id                  UUID NOT NULL REFERENCES public.fund_products(id) ON DELETE CASCADE,
    as_of                    DATE NOT NULL,
    valid_deposits           NUMERIC(16, 2),
    total_units              NUMERIC(18, 4) NOT NULL,
    available_value          NUMERIC(16, 2) NOT NULL,
    nav                      NUMERIC(18, 6) NOT NULL,
    recorded_by              UUID,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_snapshots_lookup ON public.investment_portal_snapshots (investor_organization_id, fund_id, as_of DESC);
ALTER TABLE public.investment_portal_snapshots ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.investment_portal_snapshots TO service_role;

-- Stephen's Longhorn deposits, units as shown by the portal order book (2026-11-24).
UPDATE public.investments SET units = 4436.48, flow_code = 'TXN/2025/0001053', portal_verified_at = now() WHERE id = '21031817-5e52-4049-87b7-f44ef5119cea';
UPDATE public.investments SET units = 141.80,  flow_code = 'TXN/2026/0030818', portal_verified_at = now() WHERE id = 'e7baef25-c5c9-4de5-bc77-8ddc3f88bc99';
UPDATE public.investments SET units = 564.32,  flow_code = 'TXN/2026/0031862', portal_verified_at = now() WHERE id = 'f0192452-a89a-4c4f-9d39-18d3080069a5';
UPDATE public.investments SET units = 158.40,  flow_code = 'TXN/2025/0023198', portal_verified_at = now() WHERE id = '6fe9b887-fc15-4e77-8773-1296a356ca4e';
NOTIFY pgrst, 'reload config';

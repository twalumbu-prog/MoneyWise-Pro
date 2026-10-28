-- What an investment is worth now. MoneyWise has no price feed from the investment companies, so the person (or their accountant)
-- records the current value per company; the latest row wins and anything invested afterwards is added on top (see
-- services/investmentPortfolio.service.ts). Service-role access only (RLS on, no policies).
CREATE TABLE IF NOT EXISTS public.investment_valuations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investor_organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    investment_target_id UUID NOT NULL REFERENCES public.investment_targets(id) ON DELETE CASCADE,
    value NUMERIC(16,2) NOT NULL CHECK (value >= 0),
    recorded_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_investment_valuations_lookup ON public.investment_valuations(investor_organization_id, investment_target_id, created_at DESC);
ALTER TABLE public.investment_valuations ENABLE ROW LEVEL SECURITY;

-- Exact per-org daily AI call counter for transaction capture. Service-role only: RLS on, no policies.
CREATE TABLE IF NOT EXISTS public.capture_ai_usage (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    day             DATE NOT NULL,
    calls           INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
    PRIMARY KEY (organization_id, day)
);

ALTER TABLE public.capture_ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.capture_ai_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.capture_ai_usage TO service_role;

-- Atomically reserves one call. Returns FALSE, reserving nothing, once the budget is used up.
CREATE OR REPLACE FUNCTION public.reserve_capture_ai_call(p_org UUID, p_day DATE, p_budget INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_calls INTEGER;
BEGIN
    INSERT INTO public.capture_ai_usage AS u (organization_id, day, calls)
    VALUES (p_org, p_day, 1)
    ON CONFLICT (organization_id, day) DO UPDATE SET calls = u.calls + 1
    WHERE u.calls < p_budget
    RETURNING calls INTO v_calls;

    RETURN v_calls IS NOT NULL AND v_calls <= p_budget;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_capture_ai_call(UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_capture_ai_call(UUID, DATE, INTEGER) TO service_role;

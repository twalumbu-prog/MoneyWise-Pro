-- MoneyWise Ads, phase 1: sellers pay a flat price for a Marketplace placement (a featured item, a boosted item or a featured store).
-- The seller pays from their wallet to the MoneyWise ads account; an admin approves the ad before it goes live, or rejects it and the
-- payment is returned. Keep in step with apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_by        UUID NOT NULL,
    kind              TEXT NOT NULL CHECK (kind IN ('FEATURED_ITEM', 'BOOSTED_ITEM', 'FEATURED_STORE')),
    product_id        UUID REFERENCES public.products(id) ON DELETE SET NULL,
    days              INTEGER NOT NULL CHECK (days BETWEEN 1 AND 60),
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL,
    price             NUMERIC(14,2) NOT NULL,
    status            TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
                        CHECK (status IN ('PENDING_PAYMENT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'FAILED')),
    idempotency_key   TEXT UNIQUE,
    requisition_id    UUID,
    payment_reference TEXT,
    reviewed_by       TEXT,
    reviewed_at       TIMESTAMPTZ,
    reject_reason     TEXT,
    refunded_at       TIMESTAMPTZ,
    refund_reference  TEXT,
    impressions       INTEGER NOT NULL DEFAULT 0,
    clicks            INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_org ON public.ad_campaigns (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_live ON public.ad_campaigns (status, start_date, end_date);

-- Counts an impression or a click on an approved ad.
CREATE OR REPLACE FUNCTION public.bump_ad(p_id UUID, p_kind TEXT) RETURNS VOID
LANGUAGE sql SET search_path = public AS $$
    UPDATE public.ad_campaigns
       SET impressions = impressions + CASE WHEN p_kind = 'impression' THEN 1 ELSE 0 END,
           clicks      = clicks      + CASE WHEN p_kind = 'click' THEN 1 ELSE 0 END
     WHERE id = p_id AND status = 'APPROVED';
$$;

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

-- Blue Opus share offers: a private, personal agreement to buy shares at the round's post-money valuation (Blue Opus is not publicly listed).
-- A row is a person's signed offer (their typed name and the agreement version they accepted). It is NOT a sale: Blue Opus reviews it, countersigns,
-- and arranges payment itself, and the status here follows that. Ownership % = amount / post-money valuation, fixed when the offer is signed.
-- The round's terms (valuation, minimum, maximum, open or closed) are in app_settings key 'blue_opus_round'.
-- Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.share_offers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    organization_id     UUID,
    full_name           TEXT NOT NULL,
    email               TEXT,
    phone               TEXT,
    amount              NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    post_money          NUMERIC(16, 2) NOT NULL CHECK (post_money > 0),   -- the valuation the offer was made at
    ownership_pct       NUMERIC(10, 6) NOT NULL CHECK (ownership_pct > 0),
    currency            TEXT NOT NULL DEFAULT 'ZMW',
    agreement_version   TEXT NOT NULL,
    accepted_name       TEXT NOT NULL,                                     -- what they typed to sign
    accepted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_ip         TEXT,
    status              TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','COUNTERSIGNED','PAID','DECLINED','WITHDRAWN')),
    note                TEXT,                                              -- Blue Opus's note to the person
    decided_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_share_offers_user ON public.share_offers (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_offers_status ON public.share_offers (status, created_at DESC);

ALTER TABLE public.share_offers ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.share_offers TO service_role;

-- The round: K1,500,000 for 20% at a K7,500,000 post-money valuation (the investor deck); open. Minimum K1,000 per person; no per-person maximum until Blue Opus sets them.
INSERT INTO public.app_settings (key, value, description)
VALUES ('blue_opus_round', '{"enabled": true, "postMoney": 7500000, "currency": "ZMW", "minAmount": 1000, "maxAmount": null, "maxTotal": 1500000, "agreementVersion": "2026-11-draft-2"}'::jsonb, 'Blue Opus share round (post-money valuation, limits, open or closed)')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- Marketplace: auctions, bids and seller reviews.
--  * An auction is a timed sale of one product: highest bid wins; the winner pays through a one-time payment link at the winning price.
--  * Bids are placed through place_marketplace_bid(), which locks the auction row so two simultaneous bids can never both win.
--  * A buyer reviews a seller once (1 to 5 stars and a comment); it is tagged as a verified purchase when it matches a completed order.
-- Keep in step with the inline migration in apps/api/src/index.ts.

CREATE TABLE IF NOT EXISTS public.marketplace_auctions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id         UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    start_price        NUMERIC(14,2) NOT NULL CHECK (start_price >= 0),
    reserve_price      NUMERIC(14,2) CHECK (reserve_price IS NULL OR reserve_price >= 0),
    buy_now_price      NUMERIC(14,2) CHECK (buy_now_price IS NULL OR buy_now_price > 0),
    bid_increment      NUMERIC(14,2) NOT NULL DEFAULT 1 CHECK (bid_increment > 0),
    starts_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at            TIMESTAMPTZ NOT NULL,
    status             TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SOLD', 'NO_SALE', 'CANCELLED')),
    winner_user_id     UUID,
    winner_org_id      UUID,
    winner_name        TEXT,
    winner_phone       TEXT,
    winning_amount     NUMERIC(14,2),
    payment_link_token TEXT,
    settled_at         TIMESTAMPTZ,
    created_by         UUID,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_auction_open_product ON public.marketplace_auctions (product_id) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_marketplace_auctions_due ON public.marketplace_auctions (status, ends_at);

CREATE TABLE IF NOT EXISTS public.marketplace_bids (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auction_id       UUID NOT NULL REFERENCES public.marketplace_auctions(id) ON DELETE CASCADE,
    bidder_user_id   UUID NOT NULL,
    bidder_org_id    UUID,
    bidder_name      TEXT NOT NULL,
    bidder_phone     TEXT,
    amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_auction ON public.marketplace_bids (auction_id, amount DESC, created_at);

CREATE TABLE IF NOT EXISTS public.marketplace_reviews (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_org_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    reviewer_user_id  UUID NOT NULL,
    reviewer_org_id   UUID,
    reviewer_name     TEXT NOT NULL,
    rating            SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment           TEXT,
    verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (seller_org_id, reviewer_user_id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_seller ON public.marketplace_reviews (seller_org_id, created_at DESC);

-- Only the API (service role) reads and writes these.
ALTER TABLE public.marketplace_auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_reviews ENABLE ROW LEVEL SECURITY;

-- Places a bid atomically. Raises BID_CLOSED, OWN_AUCTION or BID_TOO_LOW:<minimum> instead of inserting when the bid isn't allowed.
CREATE OR REPLACE FUNCTION public.place_marketplace_bid(
    p_auction UUID, p_user UUID, p_org UUID, p_name TEXT, p_phone TEXT, p_amount NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    a public.marketplace_auctions%ROWTYPE;
    current_high NUMERIC;
    minimum NUMERIC;
    new_end TIMESTAMPTZ;
BEGIN
    SELECT * INTO a FROM public.marketplace_auctions WHERE id = p_auction FOR UPDATE;
    IF NOT FOUND OR a.status <> 'OPEN' OR a.ends_at <= now() THEN
        RAISE EXCEPTION 'BID_CLOSED';
    END IF;
    IF p_org IS NOT NULL AND p_org = a.organization_id THEN
        RAISE EXCEPTION 'OWN_AUCTION';
    END IF;

    SELECT max(amount) INTO current_high FROM public.marketplace_bids WHERE auction_id = p_auction;
    minimum := CASE WHEN current_high IS NULL THEN a.start_price ELSE current_high + a.bid_increment END;
    IF p_amount < minimum THEN
        RAISE EXCEPTION 'BID_TOO_LOW:%', minimum;
    END IF;

    INSERT INTO public.marketplace_bids (auction_id, bidder_user_id, bidder_org_id, bidder_name, bidder_phone, amount)
    VALUES (p_auction, p_user, p_org, p_name, p_phone, p_amount);

    -- A bid in the last two minutes extends the auction by two minutes, so nobody wins by out-waiting the clock.
    new_end := a.ends_at;
    IF a.ends_at - now() < interval '2 minutes' THEN
        new_end := now() + interval '2 minutes';
        UPDATE public.marketplace_auctions SET ends_at = new_end WHERE id = p_auction;
    END IF;

    RETURN jsonb_build_object('amount', p_amount, 'endsAt', new_end);
END;
$$;

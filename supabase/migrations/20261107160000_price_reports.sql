-- Shopper price reports: people report a price they saw (with a photo of the tag or receipt) and earn points. Two independent reports of
-- about the same price at the same place confirm it; a price far from the others is held for the team to check. Additive only.
-- Keep in step with the inline migration in apps/api/src/index.ts.

ALTER TABLE public.price_points ADD COLUMN IF NOT EXISTS place_key     TEXT;                       -- the place's name boiled down, so "ShopRite  Garden City" and "Shoprite, Garden City" match
ALTER TABLE public.price_points ADD COLUMN IF NOT EXISTS flag          TEXT;                       -- OUTLIER: held for review because it is far from the other prices
ALTER TABLE public.price_points ADD COLUMN IF NOT EXISTS confirmations INTEGER NOT NULL DEFAULT 1; -- how many different shoppers have reported about this price here
ALTER TABLE public.price_points ADD COLUMN IF NOT EXISTS review_note   TEXT;
ALTER TABLE public.price_points ADD COLUMN IF NOT EXISTS points_awarded INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_price_points_place_key ON public.price_points (catalog_item_id, place_key, observed_on DESC) WHERE place_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_points_reporter ON public.price_points (reported_by, created_at DESC) WHERE reported_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_points_pending ON public.price_points (status, created_at) WHERE status = 'PENDING';

NOTIFY pgrst, 'reload config';

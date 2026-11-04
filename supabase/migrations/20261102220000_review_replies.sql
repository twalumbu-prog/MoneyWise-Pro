-- A seller can reply to a review of their store. Keep in step with apps/api/src/index.ts.
ALTER TABLE public.marketplace_reviews ADD COLUMN IF NOT EXISTS seller_reply TEXT;
ALTER TABLE public.marketplace_reviews ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

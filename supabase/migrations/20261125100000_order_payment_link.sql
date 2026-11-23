-- A Marketplace order can be paid with mobile money or a card through a one-time payment link (the same link the seller's store uses), not only from a MoneyWise wallet.
-- The order remembers which link, so when the link is paid the order becomes PAID.
-- Keep in step with the inline migration in apps/api/src/index.ts.

ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS payment_link_token TEXT;
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_link ON public.marketplace_orders (payment_link_token) WHERE payment_link_token IS NOT NULL;

NOTIFY pgrst, 'reload schema';

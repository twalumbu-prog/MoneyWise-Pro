-- =============================================================================
-- Multi-item invoice payment links
-- =============================================================================
-- Extends the single-product one-time payment_links to also support a multi-item
-- "invoice" link: an admin builds a cart for a specific customer, and the whole
-- basket is paid through one /pl/:token link. Legacy single-product links keep
-- working unchanged (product_id set, items null). Additive and idempotent.
-- =============================================================================

-- Customer email (for optional invoice notification) + itemized snapshot.
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS customer_email TEXT;
-- items: [{ product_id, name, quantity, unit_price, check_in?, check_out? }]
ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS items JSONB;

-- Multi-item invoice links carry the basket in `items` and leave product_id null.
ALTER TABLE public.payment_links ALTER COLUMN product_id DROP NOT NULL;

NOTIFY pgrst, 'reload config';

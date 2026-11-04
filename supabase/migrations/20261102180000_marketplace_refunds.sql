-- Refunds on Marketplace orders: the seller sends the buyer's money back wallet to wallet.
-- Keep in step with the inline migration in apps/api/src/index.ts.
ALTER TABLE public.marketplace_orders DROP CONSTRAINT IF EXISTS marketplace_orders_status_check;
ALTER TABLE public.marketplace_orders ADD CONSTRAINT marketplace_orders_status_check CHECK (status IN
    ('PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID', 'PROCESSING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'DISPUTED', 'FAILED', 'REFUNDED'));
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS refund_started_at TIMESTAMPTZ;
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(14,2);
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS refund_reference TEXT;

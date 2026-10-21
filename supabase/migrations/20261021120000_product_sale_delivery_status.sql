-- Fulfilment tracking for product sales: has the item been handed over to the buyer?
--   delivery_status: PENDING (default) | DELIVERED
--   delivered_at / delivered_by: when and who marked it, for the audit trail on the receipt.

ALTER TABLE public.product_sales
    ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS delivered_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_sales_delivery_status_check') THEN
        ALTER TABLE public.product_sales
            ADD CONSTRAINT product_sales_delivery_status_check CHECK (delivery_status IN ('PENDING', 'DELIVERED'));
    END IF;
END$$;

COMMENT ON COLUMN public.product_sales.delivery_status IS 'PENDING until the merchant marks the item as handed over / delivered.';

NOTIFY pgrst, 'reload config';

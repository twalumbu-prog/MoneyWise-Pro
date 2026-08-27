-- Add delivery configuration columns to the products table.
-- requires_delivery: whether this product type needs physical delivery at all
--   (physical goods = true, digital/service/donation = false by default).
-- allow_external_delivery: when true, the store checkout shows the rider-service
--   selector; when false, the merchant handles delivery and charges a flat fee.
-- own_delivery_charge: the flat delivery fee charged when the merchant handles
--   their own delivery (used when allow_external_delivery is false).

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS requires_delivery BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS allow_external_delivery BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS own_delivery_charge NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- Store the customer's delivery details (address, mode, rider service chosen)
-- alongside each product_sale row so the merchant can see them in the inflow inbox.
ALTER TABLE public.product_sales
    ADD COLUMN IF NOT EXISTS order_details JSONB;

COMMENT ON COLUMN public.products.requires_delivery IS
    'True if the product needs physical delivery or pick-up at checkout.';
COMMENT ON COLUMN public.products.allow_external_delivery IS
    'True = offer rider-service options; false = merchant handles own delivery.';
COMMENT ON COLUMN public.products.own_delivery_charge IS
    'Flat delivery fee (ZMW) charged when the merchant manages their own delivery.';
COMMENT ON COLUMN public.product_sales.order_details IS
    'JSON snapshot of the delivery details chosen at checkout (address, mode, rider, charge).';

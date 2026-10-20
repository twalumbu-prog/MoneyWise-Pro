-- Per-product customer information collected on its own checkout page, right before payment.
--   products.checkout_fields: ordered field definitions the merchant switched on, e.g.
--     [{"id":"f_name","label":"Full name","type":"text","required":true},
--      {"id":"f_size","label":"Size","type":"select","required":true,"options":["S","M","L"]}]
--   product_sales.customer_responses: what the buyer entered, snapshotted per line item, e.g.
--     [{"id":"f_size","label":"Size","value":"M"}]

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS checkout_fields JSONB NOT NULL DEFAULT '[]';

ALTER TABLE public.product_sales
    ADD COLUMN IF NOT EXISTS customer_responses JSONB;

COMMENT ON COLUMN public.products.checkout_fields IS
    'Ordered info fields (text/select) the buyer must fill on the store information page before paying.';
COMMENT ON COLUMN public.product_sales.customer_responses IS
    'Snapshot of the buyer''s answers to the product checkout_fields: [{id,label,value}].';

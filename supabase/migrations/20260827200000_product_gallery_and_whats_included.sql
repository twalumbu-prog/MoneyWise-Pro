-- Additional product images for the gallery carousel on the store detail page.
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS additional_images JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS whats_included    JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.products.additional_images IS
    'Ordered array of extra image URLs shown in the store detail page carousel.';
COMMENT ON COLUMN public.products.whats_included IS
    'Bullet-point list of feature / inclusion strings shown on the store detail page.';

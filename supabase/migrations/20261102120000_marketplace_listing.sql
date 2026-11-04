-- Marketplace: a seller chooses which of their products appear in the in-app Marketplace. Off by default, so nothing is listed
-- until its owner opts in. Keep in step with the inline migration in apps/api/src/index.ts.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS marketplace_listed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_marketplace_listed
    ON public.products (marketplace_listed, created_at DESC)
    WHERE marketplace_listed = TRUE AND is_active = TRUE;

-- A store's look on the Marketplace: accent colour, light or dark, type style, corners, layout, tagline and banner.
-- Only these few choices are stored (the API checks each one), so every store reads well. Keep in step with apps/api/src/index.ts.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS store_theme JSONB;

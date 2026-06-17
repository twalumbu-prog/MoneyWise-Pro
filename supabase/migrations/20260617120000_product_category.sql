-- Adds an optional free-text category to products so the public payment
-- portal can group/filter the catalog into toggle tabs (e.g. "School Fees",
-- "Merchandise"). Null/blank means the product shows under the "All" tab only.
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS category TEXT;

NOTIFY pgrst, 'reload config';

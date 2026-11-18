-- Marketplace: new products are listed by default. A seller can still switch an item off with "List on Marketplace".
-- Existing rows keep whatever they have; only products created from now on default to listed.
ALTER TABLE public.products ALTER COLUMN marketplace_listed SET DEFAULT TRUE;

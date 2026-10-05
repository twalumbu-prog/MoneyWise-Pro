-- Savings details: an optional description, a goal date, how often to save, and (wishlist) a product link.
ALTER TABLE public.savings_goals
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS target_date DATE,
    ADD COLUMN IF NOT EXISTS frequency   TEXT CHECK (frequency IS NULL OR frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    ADD COLUMN IF NOT EXISTS product_url TEXT;

NOTIFY pgrst, 'reload schema';

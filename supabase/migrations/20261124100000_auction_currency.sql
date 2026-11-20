-- An auction is run in the currency of the product it sells (kwacha or US dollars). Every amount on it (start, reserve, buy it now, bids, the winning
-- amount) is in that currency. Existing auctions stay in kwacha, which is what they were.
-- Keep in step with the inline migration in apps/api/src/index.ts.

ALTER TABLE public.marketplace_auctions ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ZMW';
ALTER TABLE public.marketplace_auctions DROP CONSTRAINT IF EXISTS marketplace_auctions_currency_check;
ALTER TABLE public.marketplace_auctions ADD CONSTRAINT marketplace_auctions_currency_check CHECK (currency IN ('ZMW', 'USD'));

NOTIFY pgrst, 'reload schema';

-- Real US dollar charging.
--  * products.currency: what a product or service is priced in (its price is in this currency). Default kwacha, so nothing changes until a seller picks USD.
-- (The currency a card was really charged in is kept in lipila_card_sessions.context.charge_currency, so no column is needed there.
--  net_amount stays the kwacha the books record; charged_amount and fee_amount are in that charge currency.)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ZMW';
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_currency_check;
ALTER TABLE public.products ADD CONSTRAINT products_currency_check CHECK (currency IN ('ZMW', 'USD'));

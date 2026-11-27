-- The external account (MTN MoMo, Airtel Money, a bank such as FNB …) a capture is booked into. Null = the default
-- account for its provider.
alter table public.momo_captures add column if not exists external_wallet_id uuid;

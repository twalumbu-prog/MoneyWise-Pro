-- A free-text note on a captured message ("Rent for November, paid to the landlord"). It travels with the capture
-- and is sent to the AI categoriser and written onto the ledger entry when the capture is booked.
alter table public.momo_captures add column if not exists note text;

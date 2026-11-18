-- How big and heavy one unit of a product is, so Opus Delivery (a diesel Isuzu KB 300 pickup) can price the trip.
-- Keep in step with the inline migration in apps/api/src/index.ts.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(8,2) CHECK (weight_kg IS NULL OR weight_kg > 0);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS parcel_size TEXT CHECK (parcel_size IS NULL OR parcel_size IN ('SMALL', 'MEDIUM', 'LARGE', 'BULKY'));

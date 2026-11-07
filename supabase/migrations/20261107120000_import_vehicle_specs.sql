-- Imported vehicles: what a car is (year, mileage, engine size, steering and so on), kept beside the price so the price can depend on engine
-- size and age. Additive only. Keep in step with the inline migration in apps/api/src/index.ts.
ALTER TABLE public.imported_products ADD COLUMN IF NOT EXISTS specs JSONB;

NOTIFY pgrst, 'reload config';

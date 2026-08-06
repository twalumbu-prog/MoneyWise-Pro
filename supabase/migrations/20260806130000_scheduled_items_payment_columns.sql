-- Add payment recipient columns to scheduled_items.
-- These were referenced in the API but never added to the schema.
ALTER TABLE public.scheduled_items
    ADD COLUMN IF NOT EXISTS payment_method      TEXT,
    ADD COLUMN IF NOT EXISTS recipient_account   TEXT,
    ADD COLUMN IF NOT EXISTS recipient_bank_code TEXT,
    ADD COLUMN IF NOT EXISTS recipient_name      TEXT;

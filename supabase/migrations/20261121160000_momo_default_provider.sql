-- Which provider this person's phone number is on. Used for messages that don't name one (e.g. a balance reply that
-- just says "Your Current Balance is ZMW 0.62" and arrives from the iPhone Shortcut, which doesn't pass the sender).
ALTER TABLE public.momo_capture_settings
    ADD COLUMN IF NOT EXISTS default_provider TEXT CHECK (default_provider IN ('MTN', 'AIRTEL', 'ZAMTEL'));

NOTIFY pgrst, 'reload config';

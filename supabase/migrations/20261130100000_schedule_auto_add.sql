-- Schedules that add themselves: from an email (a bill or subscription receipt) or from a payment pattern. Marks where an item came from, so it can be
-- shown ("Added from an email") and undone, keeps the payee so the same bill is never added twice, and allows bills in dollars.
ALTER TABLE public.inbound_emails ADD COLUMN IF NOT EXISTS intent_due_date DATE;
ALTER TABLE public.inbound_emails ADD COLUMN IF NOT EXISTS intent_cadence TEXT;
ALTER TABLE public.inbound_emails ADD COLUMN IF NOT EXISTS scheduled_item_id UUID;
ALTER TABLE public.inbound_emails ADD COLUMN IF NOT EXISTS schedule_scanned_at TIMESTAMPTZ;  -- when the email was last read for a repeating bill

ALTER TABLE public.scheduled_items ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE public.scheduled_items ADD COLUMN IF NOT EXISTS source_email_id UUID;
ALTER TABLE public.scheduled_items ADD COLUMN IF NOT EXISTS payee_key TEXT;
ALTER TABLE public.scheduled_items ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ZMW';
ALTER TABLE public.scheduled_items ADD COLUMN IF NOT EXISTS foreign_amount NUMERIC(15,2);
CREATE INDEX IF NOT EXISTS idx_scheduled_items_payee ON public.scheduled_items (organization_id, payee_key) WHERE payee_key IS NOT NULL;


-- Yearly bills (a domain, an annual plan).
ALTER TABLE public.scheduled_items DROP CONSTRAINT IF EXISTS scheduled_items_cadence_check;
ALTER TABLE public.scheduled_items ADD CONSTRAINT scheduled_items_cadence_check CHECK (cadence IN ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'));
NOTIFY pgrst, 'reload schema';

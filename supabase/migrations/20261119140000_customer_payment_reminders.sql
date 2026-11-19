-- Reminders to the CUSTOMER who owes a business money (the older follow-up reminders go to the business's own finance team).
-- Off until a business switches them on. Additive: nothing changes for businesses that never do.
CREATE TABLE IF NOT EXISTS public.payment_reminder_settings (
    organization_id   uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    enabled           boolean NOT NULL DEFAULT false,
    repeat_every_days integer NOT NULL DEFAULT 7 CHECK (repeat_every_days BETWEEN 2 AND 30),
    max_reminders     integer NOT NULL DEFAULT 3 CHECK (max_reminders BETWEEN 1 AND 6),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_reminder_settings ENABLE ROW LEVEL SECURITY; -- server only (service role): no policies

-- How many customer reminders an invoice has had, and when the last went. Separate from reminder_count / last_reminder_at, which count the
-- finance-team emails.
ALTER TABLE public.customer_invoices ADD COLUMN IF NOT EXISTS customer_reminder_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.customer_invoices ADD COLUMN IF NOT EXISTS customer_last_reminder_at timestamptz;

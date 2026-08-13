-- Invoice management: archive flag + soft-delete support
-- is_archived hides an invoice from the inbox without cancelling the link.
-- Archived invoices can be un-archived; they are not deleted from the DB.

ALTER TABLE public.payment_links
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_payment_links_is_archived
    ON public.payment_links(organization_id, is_archived)
    WHERE is_archived = FALSE;

NOTIFY pgrst, 'reload config';

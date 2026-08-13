-- =============================================================================
-- Invoice AR Accounting
-- =============================================================================
-- Adds a nullable invoice_link_id FK on cashbook_entries so that the PENDING
-- Accounts Receivable entry created when an invoice link is issued can be
-- found and voided when the customer's payment lands.
--
-- account_type is VARCHAR(50) with no CHECK constraint, so
-- 'ACCOUNTS_RECEIVABLE' can be inserted without any constraint change.
-- =============================================================================

ALTER TABLE public.cashbook_entries
    ADD COLUMN IF NOT EXISTS invoice_link_id UUID
        REFERENCES public.payment_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cashbook_entries_invoice_link_id
    ON public.cashbook_entries(invoice_link_id)
    WHERE invoice_link_id IS NOT NULL;

NOTIFY pgrst, 'reload config';

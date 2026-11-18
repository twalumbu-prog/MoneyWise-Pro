-- Import an invoice into a request for funds: the scanned supplier invoice is kept on the requisition, and the line items
-- created from it have their prices locked so the request matches the invoice exactly.
ALTER TABLE public.requisitions
    ADD COLUMN IF NOT EXISTS invoice_url text,
    ADD COLUMN IF NOT EXISTS invoice_number text,
    ADD COLUMN IF NOT EXISTS invoice_supplier text,
    ADD COLUMN IF NOT EXISTS invoice_date date,
    ADD COLUMN IF NOT EXISTS invoice_total numeric(14,2),
    ADD COLUMN IF NOT EXISTS invoice_currency text,
    ADD COLUMN IF NOT EXISTS invoice_ocr_data jsonb;

ALTER TABLE public.line_items
    ADD COLUMN IF NOT EXISTS price_locked boolean NOT NULL DEFAULT false;

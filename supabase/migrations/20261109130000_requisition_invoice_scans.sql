-- What was read from an uploaded invoice, kept server-side so a request is built from it and not from numbers the browser sends back.
CREATE TABLE IF NOT EXISTS public.requisition_invoice_scans (
    path text PRIMARY KEY,
    organization_id uuid NOT NULL,
    scanned_by uuid NOT NULL,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.requisition_invoice_scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.requisition_invoice_scans FROM anon, authenticated;
GRANT ALL ON public.requisition_invoice_scans TO service_role;

-- Short invoice links: /<business-code>/invoice/<n> instead of /pl/<48-char token>.
--   * organizations.invoice_code — short, unique, lowercase code built from the business initials (e.g. "tec").
--   * payment_links.invoice_no   — the link's invoice number within its business (1, 2, 3 …).
-- The old /pl/<token> links keep working; the token stays the link's real identity.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS invoice_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_invoice_code_key ON public.organizations (invoice_code) WHERE invoice_code IS NOT NULL;

ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS invoice_no INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS payment_links_org_invoice_no_key ON public.payment_links (organization_id, invoice_no) WHERE invoice_no IS NOT NULL;

-- Track, per Master Fees record, whether/where it has been recorded in QuickBooks, so the automatic
-- posting (masterfees_qb.service.ts) is idempotent and reviewable.
--   qb_invoice_id : QuickBooks invoice id(s) for an INVOICE record, comma-separated in fee-item order
--   qb_sync_status: SUCCESS (in QuickBooks) | REVIEW (needs a human, see qb_sync_error) | FAILED (API error)
-- Payments keep using cashbook_entries.qb_sync_status / qb_deposit_id ('PMT:<id>') and masterfees_qb_payments.
ALTER TABLE public.masterfees_records ADD COLUMN IF NOT EXISTS qb_invoice_id text;
ALTER TABLE public.masterfees_records ADD COLUMN IF NOT EXISTS qb_sync_status text;
ALTER TABLE public.masterfees_records ADD COLUMN IF NOT EXISTS qb_sync_error text;
ALTER TABLE public.masterfees_records ADD COLUMN IF NOT EXISTS qb_sync_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_masterfees_records_qb_pending ON public.masterfees_records (organization_id, record_type, qb_sync_status);
NOTIFY pgrst, 'reload schema';

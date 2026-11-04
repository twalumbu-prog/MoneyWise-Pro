-- Keep in step with the inline migration in apps/api/src/index.ts.

-- Follow-ups: stock by colour or size on bills, wallet payments for supplier bills, and sales feeding stock history and cost of goods sold.
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payout_method TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payout_bank_code TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payout_account TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payout_account_name TEXT;
ALTER TABLE public.purchase_bill_lines ADD COLUMN IF NOT EXISTS variant_id TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS variant_id TEXT;
ALTER TABLE public.purchase_bills ADD COLUMN IF NOT EXISTS requisition_id UUID;
ALTER TABLE public.bill_payments ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE public.bill_payments ADD COLUMN IF NOT EXISTS requisition_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_payments_requisition ON public.bill_payments (requisition_id) WHERE requisition_id IS NOT NULL;
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
    CHECK (source_type = ANY (ARRAY['CASHBOOK','LINE_ITEMS','OPENING','MANUAL','RECLASS','MASTERFEES','INVOICE','IMPORT','PURCHASE_BILL','BILL_PAYMENT','STOCK_ADJUSTMENT','STOCK_SALE']));

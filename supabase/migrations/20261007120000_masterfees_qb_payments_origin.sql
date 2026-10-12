-- Distinguish QuickBooks payments MoneyWise CREATED from ones that already existed in QuickBooks
-- (entered by the bookkeeper / from bank statements) and were only MATCHED to a Master Fees payment.
-- scripts/reverse_all_qb_payments.ts deletes payments from QuickBooks: it must only ever touch POSTED rows.
ALTER TABLE public.masterfees_qb_payments ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'POSTED';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'masterfees_qb_payments_origin_chk') THEN
    ALTER TABLE public.masterfees_qb_payments ADD CONSTRAINT masterfees_qb_payments_origin_chk CHECK (origin IN ('POSTED','LINKED'));
  END IF;
END $$;
COMMENT ON COLUMN public.masterfees_qb_payments.origin IS 'POSTED = created in QuickBooks by MoneyWise (reversible); LINKED = already existed in QuickBooks, only matched — NEVER delete from QuickBooks';
NOTIFY pgrst, 'reload schema';

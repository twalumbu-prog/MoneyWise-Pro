-- Durable link from a cashbook entry to the bank/Lenco statement transaction
-- it was reconciled against, independent of the Master Fees receipt reference
-- already stored in external_reference. Format:
--   LENCO-STMT:<statement date>T<statement time>|<statement payer name>|K<statement amount>
ALTER TABLE public.cashbook_entries
  ADD COLUMN IF NOT EXISTS bank_statement_reference TEXT;

COMMENT ON COLUMN public.cashbook_entries.bank_statement_reference IS
  'Link to the bank/Lenco statement transaction this entry was reconciled against (set by the Master Fees <-> Lenco statement reconciliation pass). Format: LENCO-STMT:<date>T<time>|<payer>|K<amount>.';

NOTIFY pgrst, 'reload config';

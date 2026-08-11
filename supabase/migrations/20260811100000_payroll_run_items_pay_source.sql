-- Add pay_source and destination_method to payroll_run_items
-- pay_source: 'wallet:<uuid>' | 'CASH' | 'BANK_TRANSFER' | 'AIRTEL_MONEY' | 'MTN_MONEY' | 'ZAMTEL_MONEY' | 'CHEQUE'
-- destination_method: 'BANK' | 'MOBILE_MONEY' (only relevant when pay_source is a wallet)

ALTER TABLE payroll_run_items
  ADD COLUMN IF NOT EXISTS pay_source         text,
  ADD COLUMN IF NOT EXISTS destination_method text;

-- Backfill existing rows: treat them as legacy wallet-sourced (original behaviour assumed Lenco/wallet)
UPDATE payroll_run_items
SET pay_source = 'LEGACY'
WHERE pay_source IS NULL;

-- Add payroll_run_id link and pay_from_wallet_id to requisitions
-- so each auto-generated payroll requisition traces back to its originating run
ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS payroll_run_id     uuid REFERENCES payroll_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pay_from_wallet_id uuid REFERENCES organization_wallets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_requisitions_payroll_run_id
  ON requisitions(payroll_run_id)
  WHERE payroll_run_id IS NOT NULL;

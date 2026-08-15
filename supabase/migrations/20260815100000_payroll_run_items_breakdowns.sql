-- Per-configured-type allowance and deduction breakdowns, so a payslip can show
-- each configured line item separately rather than a single lumped total.
ALTER TABLE payroll_run_items
  ADD COLUMN IF NOT EXISTS allowance_breakdown jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deduction_breakdown jsonb DEFAULT '{}'::jsonb;

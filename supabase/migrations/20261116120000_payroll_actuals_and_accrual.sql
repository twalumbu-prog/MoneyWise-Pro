-- Payroll: record the figures actually paid (not only computed ones), keep school-fee / advance / loan deductions apart,
-- and let a run post its own accounting journal (gross pay, employer contributions, statutory payables, deductions, net pay).
--
-- Background: the payroll app recomputed NAPSA/NHIMA/PAYE with one shared base and old PAYE bands, kept every deduction in two
-- buckets (loans, other), and approving a run only created the net-pay requisitions — no payroll journal reached the ledger or
-- QuickBooks. Twalumbu's payroll sheets (Jan–Oct 2026) are the signed-off figures, so they must be recordable as they are.

ALTER TABLE public.payroll_runs
    ADD COLUMN IF NOT EXISTS source            text        NOT NULL DEFAULT 'APP',   -- 'APP' (run in MoneyWise) | 'IMPORTED' (signed-off sheet, paid outside the app)
    ADD COLUMN IF NOT EXISTS pay_date          date,
    ADD COLUMN IF NOT EXISTS accrual_journal_id uuid,                                 -- journal_entries.id of the payroll journal
    ADD COLUMN IF NOT EXISTS allocation_journal_id uuid,                              -- journal_entries.id of the deductions allocation journal
    ADD COLUMN IF NOT EXISTS qb_journal_id     text,
    ADD COLUMN IF NOT EXISTS qb_allocation_journal_id text,
    ADD COLUMN IF NOT EXISTS qb_sync_status    text,
    ADD COLUMN IF NOT EXISTS qb_sync_error     text;

ALTER TABLE public.payroll_run_items
    ADD COLUMN IF NOT EXISTS school_fees       numeric     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS salary_advances   numeric     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bonus             numeric     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS statutory_override boolean    NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS department        text;

ALTER TABLE public.payroll_config
    ADD COLUMN IF NOT EXISTS statutory_rules   jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- {napsa_rate, nhima_rate, napsa_monthly_cap, paye_bands, overtime_in}
    ADD COLUMN IF NOT EXISTS account_map       jsonb       NOT NULL DEFAULT '{}'::jsonb;  -- role -> accounts.id for the payroll journal

CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_one_per_period
    ON public.payroll_runs (organization_id, period_year, period_month)
    WHERE status <> 'CANCELLED';

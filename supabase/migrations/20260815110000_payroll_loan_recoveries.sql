-- Loan / salary-advance recovery ledger.
--
-- Before this, nothing recorded that a payroll run had actually recovered an
-- instalment. Loans were re-deducted every month forever, and advances with no
-- monthly_deduction re-deducted their FULL amount every month. This table is
-- the record of what each run recovered against each loan or advance, so the
-- outstanding balance can be derived and deductions stop once settled.

CREATE TABLE IF NOT EXISTS public.payroll_loan_recoveries (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    requisition_id  uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
    payroll_run_id  uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
    staff_id        uuid REFERENCES public.payroll_staff(id) ON DELETE SET NULL,
    amount          numeric NOT NULL CHECK (amount > 0),
    period_month    integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year     integer NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),

    -- One recovery per loan per run: makes re-approval idempotent rather than
    -- double-recovering an instalment.
    CONSTRAINT payroll_loan_recoveries_once_per_run UNIQUE (requisition_id, payroll_run_id)
);

CREATE INDEX IF NOT EXISTS idx_plr_organization    ON public.payroll_loan_recoveries(organization_id);
CREATE INDEX IF NOT EXISTS idx_plr_requisition     ON public.payroll_loan_recoveries(requisition_id);
CREATE INDEX IF NOT EXISTS idx_plr_run             ON public.payroll_loan_recoveries(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_plr_period          ON public.payroll_loan_recoveries(organization_id, period_year, period_month);

-- Service-role only, consistent with the rest of the ledger tables.
ALTER TABLE public.payroll_loan_recoveries ENABLE ROW LEVEL SECURITY;

-- Terminal state for a loan/advance whose balance has been fully recovered,
-- so it drops out of payroll deduction suggestions and reads clearly in lists.
ALTER TABLE public.requisitions DROP CONSTRAINT IF EXISTS requisitions_status_check;
ALTER TABLE public.requisitions ADD CONSTRAINT requisitions_status_check
  CHECK (status::text = ANY (ARRAY[
    'DRAFT', 'PENDING_APPROVAL', 'AUTHORISED', 'REJECTED', 'DISBURSED',
    'EXPENSED', 'RECEIVED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'ACCOUNTED',
    'COMPLETED', 'SETTLED'
  ]::text[]));

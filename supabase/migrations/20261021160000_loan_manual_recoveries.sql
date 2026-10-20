-- Loan / salary-advance recoveries acknowledged by an admin outside a payroll run (cash repayment, bank deposit, …).
-- Payroll deductions are recorded in payroll_loan_recoveries; this is the same idea for everything else, so the
-- outstanding balance (owed − all recoveries) and the borrower's own books stay right whichever way it was repaid.
-- Keep in step with the inline migration in apps/api/src/index.ts.
CREATE TABLE IF NOT EXISTS public.loan_manual_recoveries (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    requisition_id  uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
    amount          numeric NOT NULL CHECK (amount > 0),
    note            text,
    recorded_by     uuid,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lmr_requisition ON public.loan_manual_recoveries(requisition_id);
CREATE INDEX IF NOT EXISTS idx_lmr_organization ON public.loan_manual_recoveries(organization_id);
ALTER TABLE public.loan_manual_recoveries ENABLE ROW LEVEL SECURITY;

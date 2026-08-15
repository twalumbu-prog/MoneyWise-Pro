-- Loan/advance requisitions have never had a real link to the payroll_staff
-- record they're for. The requestor is usually the accountant filing the
-- request on the employee's behalf, not the employee themselves, so
-- requestor_id was never a usable key — the actual staff member's name only
-- ever ended up baked into the free-text description ("LOAN: Jane Doe - ...").
-- This column gives it a real FK so payroll's recovery ledger can find it.
ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS payroll_staff_id uuid REFERENCES public.payroll_staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_requisitions_payroll_staff_id ON public.requisitions(payroll_staff_id);

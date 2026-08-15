-- The createStaffMember API insert never set `status`, so existing staff have
-- status = NULL. The payroll wizard filters to status = 'ACTIVE', which meant
-- every org with real employees saw "No active employees found to run payroll for."
--
-- Fix: backfill nulls to 'ACTIVE' (the intent for any staff that was never
-- explicitly deactivated) and add a column default so future rows are safe.

UPDATE public.payroll_staff
SET status = 'ACTIVE'
WHERE status IS NULL;

ALTER TABLE public.payroll_staff
  ALTER COLUMN status SET DEFAULT 'ACTIVE';

-- Add PROCESSING to the valid statuses for requisitions.
-- This is used for digital disbursements while they are waiting for confirmation from Lenco.

ALTER TABLE public.requisitions DROP CONSTRAINT IF EXISTS requisitions_status_check;
ALTER TABLE public.requisitions ADD CONSTRAINT requisitions_status_check
  CHECK (status::text = ANY (ARRAY[
    'DRAFT', 'PENDING_APPROVAL', 'AUTHORISED', 'PROCESSING', 'REJECTED', 'DISBURSED',
    'EXPENSED', 'RECEIVED', 'CHANGE_SUBMITTED', 'CATEGORIZED', 'ACCOUNTED',
    'COMPLETED', 'SETTLED'
  ]::text[]));

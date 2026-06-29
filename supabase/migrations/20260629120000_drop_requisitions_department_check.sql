-- The requisitions.department CHECK constraint hardcoded a fixed list of 9
-- department names (Finance, Admin, HR, IT, Education, Transportation,
-- Stocks, Maintenance, Catering). That predates the custom per-organization
-- departments feature (departments table + organizations.use_departments),
-- which lets admins create arbitrary department names. Any org using a
-- custom department name not in that fixed list got a hard insert failure
-- ("Failed to create requisition header") when creating a requisition.
-- Department validity is now enforced at the application layer against the
-- org's configured department list, so the rigid DB-level CHECK is removed.
ALTER TABLE public.requisitions DROP CONSTRAINT IF EXISTS requisitions_department_check;

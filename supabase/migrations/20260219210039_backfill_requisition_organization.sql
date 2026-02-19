-- Migration: Backfill organization_id for requisitions based on their requestor's organization
UPDATE public.requisitions r
SET organization_id = u.organization_id
FROM public.users u
WHERE r.requestor_id = u.id
AND r.organization_id IS NULL;

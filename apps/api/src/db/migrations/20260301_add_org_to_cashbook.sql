-- 1. Add organization_id column to cashbook_entries
ALTER TABLE public.cashbook_entries ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

-- 2. Backfill organization_id from requisitions and vouchers
UPDATE public.cashbook_entries ce
SET organization_id = COALESCE(
    -- Try to get it from the requisition
    (SELECT organization_id FROM public.requisitions r WHERE r.id = ce.requisition_id),
    -- If not, try to get it from the voucher
    (SELECT organization_id FROM public.vouchers v WHERE v.id = ce.voucher_id)
)
WHERE ce.organization_id IS NULL;

-- 3. For any rogue entries without a requisition or voucher (e.g., direct inflows from earlier versions),
-- we will try to assign them to the organization of the user who created them (if applicable),
-- or leave them null for now. To be safe, we won't make the column NOT NULL just yet, 
-- or we can enforce NOT NULL if we are sure all rows are covered.

UPDATE public.cashbook_entries ce
SET organization_id = (SELECT organization_id FROM public.users u WHERE u.id = ce.created_by)
WHERE ce.organization_id IS NULL AND ce.created_by IS NOT NULL;

-- 4. Create an index for faster filtering
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_org_id ON public.cashbook_entries(organization_id);

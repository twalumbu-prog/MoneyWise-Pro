-- Which QuickBooks customer each Master Fees student is. Keyed on the Master Fees student_id, never on a name: names repeat (two Natasha Phiris), are spelled
-- differently across systems, and the admission numbers do not match (QuickBooks "2025-05-0038" vs Master Fees "SCH-2026-0411").
-- The QuickBooks poster reads this BEFORE any name matching (services/masterfees_qb/customer_map.ts). Additive; service-role only, like the other ledger tables.
CREATE TABLE IF NOT EXISTS public.masterfees_qb_customer_map (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    student_id       TEXT NOT NULL,                    -- Master Fees student_id
    student_name     TEXT,
    qb_customer_id   TEXT NOT NULL,
    qb_customer_name TEXT,
    source           TEXT NOT NULL,                    -- the evidence, e.g. PAYMENT+LINKED_INVOICE+IMP_DOCNUMBER, or CONFIRMED
    confirmed_by     TEXT,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_mf_qb_customer_map_customer ON public.masterfees_qb_customer_map (organization_id, qb_customer_id);
ALTER TABLE public.masterfees_qb_customer_map ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
-- ROLLBACK: DROP TABLE IF EXISTS public.masterfees_qb_customer_map;

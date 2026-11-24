-- Quarterly / yearly budgets can be paid all at once: due_offset is the month within the budget period it falls due
-- (0 = first month). NULL = spread evenly across the period. See packages/core/src/budgets/periods.ts.
ALTER TABLE public.budgets
    ADD COLUMN IF NOT EXISTS due_offset SMALLINT NULL CHECK (due_offset IS NULL OR (due_offset >= 0 AND due_offset <= 11));

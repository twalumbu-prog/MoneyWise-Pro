-- Add a UNIQUE partial index to prevent duplicate DISBURSEMENT ledger entries
-- for the same requisition. This prevents the race condition between the 
-- webhook path and the frontend polling path both writing entries simultaneously.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cashbook_disbursement_per_requisition
  ON cashbook_entries (requisition_id)
  WHERE entry_type = 'DISBURSEMENT' AND requisition_id IS NOT NULL;

-- Add an external_reference column to cashbook_entries for collection deduplication
ALTER TABLE cashbook_entries ADD COLUMN IF NOT EXISTS external_reference TEXT;

-- Add a unique constraint on external_reference for INFLOW entries to prevent
-- webhook retry duplicates for collection events
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cashbook_inflow_per_reference
  ON cashbook_entries (external_reference)
  WHERE entry_type = 'INFLOW' AND external_reference IS NOT NULL;

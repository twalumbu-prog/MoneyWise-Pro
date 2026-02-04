-- Cashbook Enhancement Migration
-- Adds missing columns for the Cash Ledger implementation

ALTER TABLE cashbook_entries 
ADD COLUMN IF NOT EXISTS entry_type VARCHAR(50) CHECK (entry_type IN ('DISBURSEMENT', 'RETURN', 'ADJUSTMENT', 'OPENING_BALANCE')),
ADD COLUMN IF NOT EXISTS requisition_id UUID REFERENCES requisitions(id),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

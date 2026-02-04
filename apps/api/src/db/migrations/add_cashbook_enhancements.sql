-- Cash Ledger Enhancement Migration
-- Adds entry_type, requisition_id, and created_by to cashbook_entries

-- Add new columns
ALTER TABLE cashbook_entries
  ADD COLUMN IF NOT EXISTS entry_type VARCHAR(50) CHECK (entry_type IN ('DISBURSEMENT', 'RETURN', 'ADJUSTMENT', 'OPENING_BALANCE')),
  ADD COLUMN IF NOT EXISTS requisition_id UUID REFERENCES requisitions(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_cashbook_date ON cashbook_entries(date);
CREATE INDEX IF NOT EXISTS idx_cashbook_requisition ON cashbook_entries(requisition_id);
CREATE INDEX IF NOT EXISTS idx_cashbook_entry_type ON cashbook_entries(entry_type);

-- Set default opening balance if no entries exist
INSERT INTO cashbook_entries (date, description, debit, credit, balance_after, entry_type)
SELECT CURRENT_DATE, 'Opening Balance', 10000.00, 0.00, 10000.00, 'OPENING_BALANCE'
WHERE NOT EXISTS (SELECT 1 FROM cashbook_entries LIMIT 1);

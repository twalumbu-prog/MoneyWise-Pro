-- Update entry_type check constraint to include CLOSING_BALANCE
ALTER TABLE cashbook_entries
DROP CONSTRAINT IF EXISTS cashbook_entries_entry_type_check;

ALTER TABLE cashbook_entries
ADD CONSTRAINT cashbook_entries_entry_type_check 
CHECK (entry_type IN ('DISBURSEMENT', 'RETURN', 'ADJUSTMENT', 'OPENING_BALANCE', 'CLOSING_BALANCE'));

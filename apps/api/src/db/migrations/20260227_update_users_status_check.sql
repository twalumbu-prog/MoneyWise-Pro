-- Drop the existing constraint if it exists
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;

-- Add the updated constraint including PENDING_APPROVAL
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'INVITED', 'DISABLED', 'PENDING_APPROVAL'));

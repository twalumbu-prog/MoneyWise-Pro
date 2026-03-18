-- Add Lenco API keys to organizations table for multi-tenant isolation
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS lenco_public_key TEXT,
ADD COLUMN IF NOT EXISTS lenco_secret_key TEXT;

-- Update existing organizations with the currently hardcoded keys as a starting point
-- (This ensures existing functionality doesn't break)
UPDATE organizations 
SET lenco_public_key = 'pub-f3a595efda03948ae5dcd2effe073ef0aa2b333457a6c80d'
WHERE lenco_public_key IS NULL AND lenco_subaccount_id IS NOT NULL;

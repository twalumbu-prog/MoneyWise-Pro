-- Fix accounts table unique constraint to be organization-specific
-- This allows different organizations to have accounts with the same code

-- Drop the old global unique constraint on code
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_code_key;

-- Add a new composite unique constraint on (code, organization_id)
ALTER TABLE accounts ADD CONSTRAINT accounts_code_org_key UNIQUE (code, organization_id);

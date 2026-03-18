-- Add lenco_subaccount_id to organizations table
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS lenco_subaccount_id VARCHAR(255);

-- Add index for lookups
CREATE INDEX IF NOT EXISTS idx_organizations_lenco_subaccount ON public.organizations(lenco_subaccount_id);

-- Add recipient columns to disbursements table
ALTER TABLE public.disbursements 
ADD COLUMN IF NOT EXISTS recipient_account VARCHAR(50),
ADD COLUMN IF NOT EXISTS recipient_bank_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS recipient_account_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS external_reference VARCHAR(255);

-- Update cashbook_entries type check to include MONEYWISE_WALLET if it exists
-- Note: account_type is a VARCHAR(50) without a check constraint currently, 
-- but we might want to standardize it.

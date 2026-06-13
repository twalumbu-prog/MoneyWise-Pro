-- Add payment_info column to users for storing bank/mobile money account details
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_info JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.payment_info IS 'Stores the user''s bank / mobile-money payout details (account name, number, provider, etc.).';

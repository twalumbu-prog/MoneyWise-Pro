-- Add payment_test_mode column to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS payment_test_mode BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN organizations.payment_test_mode IS 'When enabled, disbursements bypass Lenco and are simulated as successful.';

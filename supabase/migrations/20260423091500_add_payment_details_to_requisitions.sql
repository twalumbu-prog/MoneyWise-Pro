-- Add payment details to requisitions table for pre-loading during disbursement
ALTER TABLE public.requisitions 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS recipient_account VARCHAR(50),
ADD COLUMN IF NOT EXISTS recipient_bank_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255);

-- Add comments for documentation
COMMENT ON COLUMN public.requisitions.payment_method IS 'The preferred payment method for this requisition (e.g., MOBILE_MONEY, BANK, CASH)';
COMMENT ON COLUMN public.requisitions.recipient_account IS 'The verified phone number or bank account number for the disbursement';
COMMENT ON COLUMN public.requisitions.recipient_bank_code IS 'The Lenco bank code or mobile operator for the recipient';
COMMENT ON COLUMN public.requisitions.recipient_name IS 'The resolved and verified name of the recipient account';

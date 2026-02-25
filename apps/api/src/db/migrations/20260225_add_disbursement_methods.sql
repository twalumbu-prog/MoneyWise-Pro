-- Migration: Add disbursement methods and account types
ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'CASH';
ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS transfer_proof_url TEXT;

ALTER TABLE cashbook_entries ADD COLUMN IF NOT EXISTS account_type VARCHAR(50) DEFAULT 'CASH';

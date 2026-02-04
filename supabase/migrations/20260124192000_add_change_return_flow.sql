
-- Phase 1: Update disbursements table
ALTER TABLE disbursements 
ADD COLUMN IF NOT EXISTS returned_denominations JSONB,
ADD COLUMN IF NOT EXISTS actual_change_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS confirmed_denominations JSONB,
ADD COLUMN IF NOT EXISTS confirmed_change_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS discrepancy_amount NUMERIC DEFAULT 0;

-- Phase 2: Update requisitions status check constraint
DO $$
BEGIN
    -- Drop the constraint if it exists (assuming standard naming or trying to find it)
    -- We'll just drop the likely name 'requisitions_status_check'
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'requisitions_status_check') THEN
        ALTER TABLE requisitions DROP CONSTRAINT requisitions_status_check;
    END IF;

    -- Add the constraint with new statuses
    ALTER TABLE requisitions
    ADD CONSTRAINT requisitions_status_check 
    CHECK (status IN (
        'PENDING', 
        'APPROVED', 
        'REJECTED', 
        'AUTHORISED', 
        'DISBURSED', 
        'RECEIVED', 
        'CHANGE_SUBMITTED', 
        'COMPLETED'
    ));
END $$;

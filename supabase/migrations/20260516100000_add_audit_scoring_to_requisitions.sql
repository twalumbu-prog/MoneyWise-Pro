-- Add audit scoring columns to requisitions table
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS audit_score NUMERIC DEFAULT 0;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS audit_score_breakdown JSONB DEFAULT '{}';
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS accounted_at TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN requisitions.audit_score IS 'Calculated audit score (0-100)';
COMMENT ON COLUMN requisitions.audit_score_breakdown IS 'Breakdown of the audit score components (Timing, Compliance, Accuracy)';
COMMENT ON COLUMN requisitions.accounted_at IS 'Timestamp when the requisition was posted to accounting/QuickBooks';

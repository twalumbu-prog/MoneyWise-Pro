-- Add advanced observability columns to ai_metrics
ALTER TABLE public.ai_metrics 
ADD COLUMN IF NOT EXISTS accuracy_by_account JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS accuracy_by_vendor JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS method_precision JSONB DEFAULT '{}';

-- Idempotent daily aggregation function extension (if needed)
-- We'll handle complex JSON counts in the application layer for flexibility

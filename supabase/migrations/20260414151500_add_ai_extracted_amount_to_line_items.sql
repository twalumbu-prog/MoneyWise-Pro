-- Add ai_extracted_amount column to line_items table
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS ai_extracted_amount DECIMAL(15, 2);

-- Add comment for documentation
COMMENT ON COLUMN line_items.ai_extracted_amount IS 'The amount extracted from the receipt via AI OCR, used for discrepancy identification.';

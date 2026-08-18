-- Add sender_name and sender_phone to cashbook_entries
-- These capture who made the deposit regardless of payment method.

ALTER TABLE cashbook_entries
  ADD COLUMN IF NOT EXISTS sender_name  TEXT,
  ADD COLUMN IF NOT EXISTS sender_phone TEXT;

-- ── Backfill 1: MasterFees entries ──────────────────────────────────────────
-- Description format: "... — Student Name"
-- Extract the name after the last ' — ' separator.
UPDATE cashbook_entries
SET sender_name = TRIM(SPLIT_PART(description, ' — ', array_length(string_to_array(description, ' — '), 1)))
WHERE entry_type = 'INFLOW'
  AND description LIKE '% — %'
  AND sender_name IS NULL;

-- ── Backfill 2: Payment link / store / QuickPay entries ─────────────────────
-- Join on external_reference → payment_links.reference to recover
-- customer_name and customer_phone that were captured at checkout.
UPDATE cashbook_entries ce
SET
  sender_name  = COALESCE(ce.sender_name,  pl.customer_name),
  sender_phone = COALESCE(ce.sender_phone, pl.customer_phone)
FROM payment_links pl
WHERE ce.external_reference IS NOT NULL
  AND pl.reference            IS NOT NULL
  AND ce.external_reference   = pl.reference
  AND ce.entry_type           = 'INFLOW'
  AND (ce.sender_name IS NULL OR ce.sender_phone IS NULL);

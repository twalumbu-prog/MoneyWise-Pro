-- Per-payout confirmation state for wallet (Lenco) disbursements.
--
-- Until now a `disbursements` row meant "we asked Lenco to pay", and the UI read that as
-- "paid". A transfer Lenco accepted but has not settled (or later rejects) was
-- indistinguishable from one that landed. These columns record what Lenco itself last
-- reported for the payout's client reference, and when we last asked.
--
--   lenco_status              successful | pending | failed | NULL (never verified)
--   lenco_status_checked_at   when Lenco was last asked
--   failure_reason            Lenco's reason when the payout failed
--
-- Additive and nullable: existing rows stay NULL ("unverified") until the payroll
-- "Verify with Lenco" action checks them.

ALTER TABLE public.disbursements
    ADD COLUMN IF NOT EXISTS lenco_status text,
    ADD COLUMN IF NOT EXISTS lenco_status_checked_at timestamptz,
    ADD COLUMN IF NOT EXISTS failure_reason text;

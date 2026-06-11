-- Forward-only reconciliation cutoff for the Lenco transaction sync.
--
-- When set, syncAllLencoTransactions (apps/api/src/controllers/lenco.controller.ts)
-- ignores any bank transaction dated before this date for the organization,
-- regardless of the wallet's opening-balance date. This lets us freeze a
-- manually-reconciled ledger so the periodic sync only ingests NEW transactions
-- from this date onward and never reaches back to re-create historical entries we
-- have already balanced by hand.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS lenco_sync_cutoff_date date;

COMMENT ON COLUMN organizations.lenco_sync_cutoff_date IS
  'Forward-only reconciliation cutoff. When set, the Lenco transaction sync ignores any bank transaction dated before this date for this organization, regardless of the opening-balance date. Used to freeze a manually-reconciled ledger so the periodic sync only ingests new transactions from this date onward.';

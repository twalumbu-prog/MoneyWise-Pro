-- Batch payroll writes ONE ledger row per employee, all sharing the batch's
-- requisition_id. A unique index of one DISBURSEMENT row per requisition makes that
-- impossible: the 33-employee Twalumbu run of 2026-07-30 wrote the first employee's
-- row and then died on the second with a unique violation, so 32 payments that had
-- genuinely left the bank were never recorded against the requisition. The Lenco sync
-- re-imported them ~5 minutes later as anonymous "Payroll for <name> / <ref>" expenses
-- belonging to no requisition and categorised nowhere — which is why the ledger's
-- payroll line showed K5,980.31 while its own breakdown showed K89,937.41.
--
-- The index exists for a real reason: the webhook path and the frontend polling path
-- both finalize a single wallet disbursement and used to race into duplicate rows.
-- That guarantee is preserved here — rows with no payout reference are still limited
-- to one per requisition — while rows that DO carry a distinct payout reference
-- (one per employee, the batch shape) are allowed to coexist. Duplicate writes of the
-- same payout are still impossible, because they would repeat its reference.
--
-- Both index names are dropped: the repo migration created
-- uniq_cashbook_disbursement_per_requisition, and production also carries an
-- idx_cashbook_unique_disbursement of the same shape.

DROP INDEX IF EXISTS uniq_cashbook_disbursement_per_requisition;
DROP INDEX IF EXISTS idx_cashbook_unique_disbursement;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_cashbook_disbursement_per_payout
  ON cashbook_entries (requisition_id, COALESCE(reference_number, ''))
  WHERE entry_type = 'DISBURSEMENT' AND requisition_id IS NOT NULL;

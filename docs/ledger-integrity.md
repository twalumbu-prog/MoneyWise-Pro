# Ledger integrity — how we know the books match the wallets

**The rule:** the cashbook records money moving in the wallets; the journal (general ledger) is *derived* from it, one balanced
journal entry per cashbook entry; Reports read the journal. If those two ever disagree, Net Worth and every report is wrong.

## What can go wrong (and did — 2026-10-12)
| Symptom | Cause | Example |
|---|---|---|
| Ledger wallet **higher** than the wallet | *Ghost* posting: a cashbook entry was deleted but its journal stayed | Blue Opus: 121 ghosts = K21.7k |
| Ledger wallet differs by a few kwacha | Entry *neutralised* (amount set to 0) after posting, journal not removed | Stephen's Workspace: K921 vs K860 |
| Categorised, but ledger still says "uncategorised" | Entry categorised after posting, no re-post | 69 platform-fee credits in Suspense |
| Entry missing from Reports | Posting skipped: org had no wallet/cash ledger account, or the background post was dropped | MEW3, TAEMJA, Ecclesiaskicks |
| Reports show the *old* calculation | While any entry is missing a journal the report falls back to the legacy path | several small orgs |

## The checks (`apps/api/src/services/ledgerIntegrity.service.ts`)
`UNBALANCED_JOURNAL`, `ORPHAN_JOURNAL`, `DUPLICATE_JOURNAL`, `MISSING_JOURNAL`, `JOURNAL_FOR_INELIGIBLE`, `CASH_LEG_MISMATCH`,
`CONTRA_STALE`, `WALLET_TIE` (each wallet's ledger account = the wallet's cashbook balance), `BALANCE_SHEET`
(assets − liabilities = equity + income − expenses). `SUSPENSE` is information: correct bookkeeping, just unclassified.
Master Fees entries are journaled by their own integration and are excluded.

## Tools
* **Audit everything (read-only):** `npm run audit:ledger` (in `apps/api`) — exit 1 if any org has an ERROR.
* **Repair one org:** `node dist/scripts/ledger_audit.js --org <uuid> --fix`  (rebuilds the ledger from the cashbook; idempotent).
* **Scenario test:** `npm run test:ledger` — creates a throwaway org, runs real transactions (deposit, categorise, payout,
  transfer between wallets, reclassify, delete, neutralise, pending→completed, org with no cash account) through the app's own
  code and asserts the ledger ties to the wallets after every step; deliberately breaks the books twice to prove the audit detects
  and the heal repairs it. **Run it before any release that touches money movement, posting or reporting.**
* **Admin API (super-admin):** `GET /admin/ledger-audit/:orgId`, `POST /admin/ledger-audit/:orgId/heal`.

## Safeguards now in the product
1. `cashbookService` **awaits** ledger posting (it was fire-and-forget; serverless can drop background work).
2. Reports **self-heal on read** (`healIfDue`, at most once per org per 5 min).
3. Missing wallet/cash ledger accounts are **created on demand**; every sub-wallet gets its own ledger account.
4. A category equal to the wallet's own account no longer makes an entry unpostable.
5. *Optional DB guard* — `supabase/manual/apply_ledger_integrity_guards.sql` (run once in the SQL editor): triggers that drop a
   journal when its cashbook entry is deleted or zeroed. The app already heals these; the triggers stop scripts run from the
   SQL editor from reintroducing them.

## Practice
* To neutralise or delete cashbook entries, prefer a script that then calls `ledgerService.repostForCashbookEntry(id)` (or run the
  heal afterwards). Neutralise-don't-delete still applies (see wallet-lenco-reconciliation).

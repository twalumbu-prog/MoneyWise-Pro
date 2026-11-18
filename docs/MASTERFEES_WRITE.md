# MoneyWise <-> Master Fees: what changed and the write side

Master Fees' own docs: `SCHOOL_DATA_API.md` (read), `SCHOOL_WRITE_API.md` (write), `MONEYWISE_SYNC.md` (its push to MoneyWise), in the Master Fees repo.

## Reading (what changed in how MoneyWise reads the feed)

| Master Fees change | What MoneyWise does now |
|---|---|
| Key in a header only (a key in the URL is refused) | Already sent as `X-MF-Public-Key`: nothing to change. |
| 120 requests a minute per school, `429` with `Retry-After` | A 429 stops the pass at once (no retry storm), and the routine sync stays quiet until the time Master Fees gave (`rateLimitedUntil` on the integration). |
| Lists answer a `pagination` block (`has_more`, `total`) | A page that says `has_more: false` ends the read with no request past the end; a read that comes up short of `total` is logged. The old overlap and 500-past-the-end handling stays as a fallback. |
| Payments' `amount` is what is credited to the student (the charge is separate) | Nothing to change: the sync already books `amount`. |
| Records MoneyWise writes come back through the feed | Skipped, not re-imported: payments with reference `MW<first 8 of the school id>-...` and invoices numbered `MW-...`. |

## Writing (new)

MoneyWise can now make changes in the school's Master Fees, with the same key it reads with. **The school has to switch it on** in Master Fees:
Integrations, MoneyWise, Data feed, "Allow MoneyWise to make changes", then one switch per kind. Until then every call answers
`403 write_disabled` / `write_kind_disabled` and nothing changes.

Endpoints (administrators only; the school is always the business's own connected school, never taken from the request):

```
POST   /integrations/masterfees/write/payments                 record a payment (manual, cash, bank or cheque only)
POST   /integrations/masterfees/write/payments/:id/void        { reason }
POST   /integrations/masterfees/write/students                 create a student
PATCH  /integrations/masterfees/write/students/:id             change a student
POST   /integrations/masterfees/write/invoices                 create an invoice
POST   /integrations/masterfees/write/invoices/:id/void        { reason }
```

## Editing a payment or an invoice (void and replace)

Master Fees has no edit: it refuses to change a payment, or an invoice's lines or total, once made. So **an edit here voids the old record and
records the corrected one under a new reference**. Both stay on record, with your reason. In the app: Settings, Integrations, Master Fees,
"Make changes in Master Fees", **Edit a payment or invoice**: pick one of the 50 most recent, correct it (pre-filled), give a reason.

```
GET   /integrations/masterfees/write/recent?type=payments|invoices
POST  /integrations/masterfees/write/payments/:id/replace      { edit_reason, ...the corrected payment }
POST  /integrations/masterfees/write/invoices/:id/replace      { edit_reason, ...the corrected invoice }
```

- The corrected record is checked in full **before** anything is voided, so a mistake in the form changes nothing.
- Safe to send twice: voiding something already void and creating with the same reference are both repeats, so the same edit sent again
  finishes the job instead of doing it twice. If the old one was voided but the new one failed, the error says so (`details.old_voided`).
- Only hand-recorded payments (manual, cash, bank, cheque) can be replaced; mobile money and card payments are changed in Master Fees.
- An invoice with a payment on it can't be replaced: void or replace the payment first. If Master Fees refuses the corrected invoice as
  `already_invoiced` for that term and year after the old one is void, the old one stays void and the error says what happened.
  **Unverified:** whether Master Fees frees the term and year when an invoice is voided. Try an invoice edit on a test student first.

Rules that come from Master Fees and are enforced here first (`services/masterfees_write.ts`):
- Nothing is deleted. A mistake is corrected by voiding.
- Unknown fields are refused by Master Fees, so each request is cut down to the fields it names.
- Creating needs our own `external_reference`; sending the same request again returns the first result (`idempotent: true`), so a retry after
  a timeout is always safe. Same reference with different details is a `409`.
- Mobile money and card payments are never written: that is real wallet money, made through Master Fees.
- Errors keep Master Fees' own `code` (`write_disabled`, `reference_reused`, `has_payments`, `wallet_payment`, `already_invoiced`, ...) and
  carry `retryable` (true for no answer, 5xx and 429).

Master Fees records every attempt in its `partner_api_audit` table; MoneyWise logs who asked.

## Not done

- **Master Fees' push to MoneyWise.** Master Fees posts invoices and payments to `api.moneywise.app/v1/invoices` and `/v1/transactions` (and
  `PUT /v1/invoices/:id`). MoneyWise's public API has no such routes (it pulls from the feed instead), and Master Fees' own docs say that
  contract was never checked. Decide whether MoneyWise should receive them or Master Fees should stop pushing.
- No screen yet for any of the write endpoints, and nothing calls them automatically.
- Not tested against a real school: the tests use a stand-in for Master Fees.

---
name: masterfees-moneywise-reconciliation
description: Reconcile MasterFees payments recorded in MoneyWise against a Lenco wallet-history CSV export for a school org (e.g. Twalumbu Education Centre). Produces a color-coded Excel workbook showing line-item and daily-total matches/gaps. Use whenever the user asks to reconcile MasterFees/Lenco payments, check for gaps between the MasterFees integration and the wallet, or wants a reconciliation spreadsheet for a school org.
---

# MasterFees <-> MoneyWise reconciliation

Compares payments MasterFees says were collected (`masterfees_records`, `record_type='PAYMENT'`,
`mf_status='success'`) against a Lenco wallet-history CSV exported from MoneyWise, for one
organization, and produces a color-coded `.xlsx` workbook.

## When to use

The user asks to "reconcile MasterFees", "check the MasterFees/Lenco payments landed correctly",
or gives a wallet-history CSV and an org name and wants gaps identified.

## Inputs needed from the user

1. **The org** — name (e.g. "Twalumbu Education Centre") or organization UUID.
2. **The wallet-history CSV** — the file MoneyWise exports from Wallet > History. Columns seen in
   practice: `Date, [Description,] Details, Receipt Number, Source, Payer Name, Student, Type,
   Status, Amount, Balance` — the exact column set has changed between exports (an older export had
   both `Description` and `Details`, a newer one only `Details`), so `load_csv` reads whichever of
   the two is present rather than assuming one. If they haven't attached one, ask them to export it
   (Wallet page > History > Export) and share the path.
3. Optionally: an explicit date range, if they don't want the CSV's own date span used.

## How it works

1. Reads `DATABASE_URL` from `apps/api/.env` (or `--db-url` / env var) to query Postgres directly.
2. Looks up the organization id from the name (or takes `--org-id` directly).
3. Pulls all successful MasterFees `PAYMENT` records for that org whose `raw->>'completed_at'`
   falls within the CSV's date span.
4. Classifies every payment reference by **channel**, because MasterFees payments move through two
   different rails and only one of them touches this CSV. `channel_of()` mirrors
   `apps/api/src/services/masterfees.service.ts`'s own `isLencoProcessed()` **exactly** — that's the
   function that actually decides, at posting time, whether MoneyWise treats a payment as
   Lenco-processed:
   - Reference starts with `REF-` (case-insensitive), nothing else → **LENCO**. This money lands in
     the Lenco wallet the CSV is exported from, so it's the real reconciliation target.
   - Everything else (`MAN-...`, `SPLIT-REF-...`, `REC-...`, `BNK-...`, ...) → **MANUAL**. A staff
     member logged the payment by hand — even a `SPLIT-REF-` reference, which looks auto-generated,
     is manual: splitting one payment across several children's invoices synthesizes that reference
     regardless of how the original payment was collected. Verified live: every `SPLIT-` row for
     this org has `raw.payment_method='manual'`. Manual-channel cash never touches this Lenco wallet,
     so these are reported separately for context and "missing in CSV" there is expected, not a gap.
   - **Do not loosen this to "anything not MAN- is Lenco"** — that was the second version's bug: it
     put `SPLIT-REF-...` in the Lenco bucket, which both invented a false "missing in CSV" gap and
     made an unrelated manual entry (whose `completed_at` is staff data-entry time, not the real
     event date) look like a same-day Lenco payment that never happened.
5. Within the Lenco channel, groups CSV rows and MasterFees records by **Receipt Number ==
   external_reference** (an exact, reliable key), then matches **individual transactions within
   each reference group by nearest timestamp** — see "Per-transaction matching" below, this is the
   part that was wrong in the first version of this skill and got corrected. A second pass then
   matches CSV deposits that have **no receipt number at all** (Lenco `Cleared` rows) against
   whatever MoneyWise records the first pass left unmatched, by exact date+amount — see "Cleared
   /no-receipt-number CSV rows" below; these are real deposits, never excluded from matching. A
   third pass then groups whatever's STILL unmatched by (date, base reference) and matches a
   remaining CSV deposit against the group's SUM — see "Split-invoice payments" below, this is for
   one Lenco payment MasterFees recorded as several sibling invoice payments. Daily totals on each
   side include all three passes.
6. Statuses (per individual transaction, not per reference-total): `MATCH`, `AMOUNT MISMATCH` (same
   reference, closest-in-time counterpart found, but the amount differs), `MATCH (GROUPED)` /
   `MATCH (GROUPED, fee-adjusted)` (one CSV deposit matched against the sum of several sibling
   MoneyWise records — see below), `MISSING IN MONEYWISE` (this specific transaction landed in the
   wallet — it has its own date/time/amount in the CSV — but has no MasterFees payment record at
   all), `MISSING IN LENCO CSV` (this specific MasterFees payment has no counterpart in the CSV for
   this period — could mean the CSV export didn't cover the full period, the payment is stuck/pending
   settlement, or it's a `SPLIT-` synthetic reference that never had a real CSV counterpart to begin
   with — worth checking with [[mtn-payout-settlement-stall]] and [[wallet-lenco-reconciliation]]
   context in mind).
7. Writes a workbook: `Summary` (grand totals + daily tables, both channels), `Lenco Channel
   Detail` / `Manual Channel Detail` (one row per individual transaction, with a "Shared Ref?"
   column flagging references that cover more than one real payment), `Raw - Full Lenco CSV` (see
   below), `Raw - MoneyWise Lenco Payments`, and `Legend`. Every row is fill-colored by status.

### `Raw - Full Lenco CSV` must contain every CSV row, unfiltered (the third fix)

Earlier versions of the "raw CSV" sheet only showed the filtered Lenco-channel fee-payment subset,
and pushed non-fee income into a separate "Other Lenco Inflows" sheet — outflows/refunds weren't
shown anywhere at all. A user correctly objected: the CSV is the reconciliation's source of truth,
so nothing from it should be invisible. `Raw - Full Lenco CSV` now contains **every single row from
the CSV export**, in original order, via `categorize_csv_row()`: a `Category` column
(`LENCO FEE PAYMENT` / `MANUAL FEE PAYMENT` / `OTHER INCOME (not a verified fee payment)` /
`OUTFLOW / REFUND (not a deposit)`) explains why each row is or isn't part of the fee-payment
matching, and a `Reconciliation Status` column + fill color carries the real match status for rows
that are part of it. Verify `len(all_csv_rows in sheet) == len(csv.DictReader rows)` after any
change here — that equality is the whole point of the sheet.

### "Cleared"/no-receipt-number CSV rows are real MasterFees deposits, not "other income" (the fourth fix)

A `Lenco`-sourced Income row with `Status='Cleared'` and no `Receipt Number` was originally bucketed
as `OTHER INCOME (not a verified fee payment)` and excluded from matching entirely. A user corrected
this: these ARE real MasterFees/Lenco deposits — their `Details` field carries the exact same
mobile-money transaction signature (`"<name> MP<yymmdd>.<hhmm>.<code>"`) as every genuine `Verified`
fee payment, they're just deposits MoneyWise's own sync never attached a receipt number to. Checked
live for Twalumbu Aug–Sep 2026: 14 of 15 such rows have **zero** matching amount anywhere in
MoneyWise's `masterfees_records` for that day — real gaps, not noise.

Since there's no reference to key on, these can't go through the normal reference-grouped matcher.
Fixed with a **second pass**, `match_no_reference_rows()`, run in `main()` after the primary
reference-based pass:
1. Collect `csv_lenco_no_ref` — Income rows, `Source='Lenco'`, blank `Receipt Number`.
2. Collect `leftover_mf_items` — MoneyWise Lenco records the primary pass couldn't match to any CSV
   reference (`status == 'MISSING IN LENCO CSV'`).
3. Match `csv_lenco_no_ref` against `leftover_mf_items` requiring an **exact same calendar date AND
   exact amount** (tight on purpose — no reference to disambiguate a looser match), nearest-timestamp
   greedy among valid candidates.
4. Anything on the CSV side left unmatched becomes its own `MISSING IN MONEYWISE` row (category
   `LENCO FEE PAYMENT (no receipt - matched by date+amount)`) — a real, actionable gap for the school
   to investigate, not something the sheet quietly drops.
5. Category is now: `LENCO FEE PAYMENT`, `LENCO FEE PAYMENT (no receipt - matched by date+amount)`,
   `MANUAL FEE PAYMENT`, `OUTFLOW / REFUND (not a deposit)`, or (rare — a genuinely non-Lenco,
   non-receipted Income row, none seen in practice) `OTHER INCOME (not a verified fee payment)`.

**Implementation note**: because a reference can now be blank or reused across the two passes,
lookups from the raw CSV/MoneyWise sheets to a reconciliation status switched from
`(reference, timestamp)` keys to `(timestamp, amount)` keys (`csv_key`/`mf_key` on every
`pair_to_result()` row) — don't regress that back to reference-keyed lookups, blank references
would collide. The `Receipt / Reference` column in the Detail sheets shows `display_ref`, which for
a date+amount match is the MoneyWise-side reference actually paired (or a "no receipt number"
placeholder when nothing matched) — `ref` itself stays `""` for these rows since that's what the
CSV side's own (blank) receipt number is, for lookup consistency.

### Per-transaction matching (the fix)

The first version of this skill grouped by reference and **summed** both sides, then diffed the
totals. That's wrong whenever more than one real payment shares a MasterFees reference — which
happens (confirmed live 2026-09-14, Twalumbu, student Saviour Chinyemba, ref
`REF-1789371890027-38`: 4 separate CSV transactions across two days, ZMW 140 each, same
parent/child/amount pattern, but only 1 MoneyWise record). Summing produced one vague "AMOUNT
MISMATCH" of ZMW 420 for the whole group — technically not wrong, but it hid which of the 4
transactions actually had no MoneyWise counterpart, which is exactly the actionable fact a school
admin needs.

Fixed by `match_items_within_ref()`: within each reference group, pair CSV rows to MoneyWise
records by **nearest timestamp** (greedy, smallest time-delta first), one-to-one. Whatever is left
unpaired on either side becomes its own `MISSING IN ...` row with its own real date/time/amount.
Re-running the same case above now correctly shows 3 individual `MISSING IN MONEYWISE` rows (13th
15:36, 14th 06:53, 14th 09:47) and 1 `MATCH` (14th 07:51 CSV ↔ 14th 07:47 MoneyWise, ~4 min apart —
normal webhook lag). Across the full Twalumbu Aug–Sep 2026 run this changed the Lenco channel from
132 match / 27 mismatch / 0 missing-in-moneywise to 157 match / 2 mismatch / **34 missing-in-
moneywise** — the true gap was being masked by the totals-only comparison.

**This pattern (`MISSING IN MONEYWISE` transactions clustered under references flagged "Shared
Ref?: Yes") is itself worth escalating as a MasterFees sync issue**, not just a reporting fix — see
`apps/api/src/services/masterfees.service.ts` around `postPayment()` / `findExistingInflow()`: when
a second payment arrives referencing a reference MoneyWise has already linked to a cashbook inflow,
the shared-Lenco-mode branch reclassifies the *existing* inflow rather than necessarily creating an
independent trail for the new transaction. Whether that's the actual cause of the missing rows
still needs confirming against the live MasterFees API (this skill only sees MoneyWise's local
`masterfees_records` mirror, which can lag or drop entries) — flag it to engineering rather than
silently treating every `MISSING IN MONEYWISE` row as resolved by re-running the reconciliation.

### Channel classification must mirror the app exactly (the second fix)

The second version of this skill classified channel with `"MANUAL" if ref.startswith("MAN-") else
"LENCO"` — i.e. it guessed that any non-`MAN-` reference format was Lenco. That's wrong: a user
caught a `SPLIT-REF-17839518140-1-QMD9C` row for student Lambert Chikonka showing `completed_at`
2026-09-14 08:17:53 in the Lenco-channel sheet, with no matching CSV transaction that day — the
real transaction was on the 9th. Checked the raw MasterFees payload: `payment_method: "manual"`,
`payment_source: "manual"`. Every `SPLIT-` reference in this org's data (11/11 checked) is
`payment_method='manual'` — splitting one manually-entered payment across several children's fee
categories generates a `SPLIT-REF-<n>-<i>-<suffix>` reference regardless of how the original payment
was collected, so the `REF-`-looking prefix is misleading. Its `completed_at` also reflects when
staff typed the entry into MasterFees, not necessarily the real historical payment date — a second,
separate data-quality property of manual entries, not something this reconciliation script can fix.

Fixed `channel_of()` to mirror `isLencoProcessed()` in `masterfees.service.ts` **exactly**: only a
strict `REF-` prefix is Lenco; everything else, including `SPLIT-REF-`/`REC-`/`BNK-`, is manual.
That function is the actual source of truth — it's what MoneyWise itself uses to decide, at posting
time, whether a payment is expected to show up in the Lenco wallet at all. Re-running Twalumbu
Aug–Sep 2026 dropped Lenco-channel "missing in CSV" from 89 to 77 (the 12 SPLIT-/REC- rows moved to
the Manual channel, where "missing in CSV" is expected, not a gap) and removed several false
same-day mismatches like the Lambert Chikonka one. **Never loosen this back to a blacklist
(`MAN-` = manual, everything else = Lenco)** — always keep it a whitelist matching the app's own
`isLencoProcessed()`, and re-check that function hasn't changed before trusting this skill's output.

## Running it

```bash
python3 .claude/skills/masterfees-moneywise-reconciliation/reconcile.py \
  --org-name "Twalumbu Education Centre" \
  --csv /path/to/wallet-history.csv \
  --out /path/to/MasterFees_Reconciliation.xlsx
```

Requires `psycopg2` and `openpyxl` (both already available in this environment). No extra flags are
needed for the date range — it defaults to the CSV's own min/max dates. Use `--date-min`/`--date-max`
(YYYY-MM-DD) to override.

After running, check the script's stdout summary (match/mismatch/missing counts per channel) before
handing the file over — sanity-check that "missing in CSV" counts for the **Lenco** channel aren't
absurdly high relative to total Lenco payments, which usually means the CSV export didn't actually
cover the full requested period (a partial/paginated export), not a real reconciliation gap. Flag
that possibility to the user rather than reporting it as a straight gap.

Then send the resulting `.xlsx` to the user with SendUserFile.

## Confirmed app bug: MoneyWise mis-dates payments completing near midnight UTC (the sixth fix)

A user caught a specific transaction (REF-1788995987350-263, Lushomo shakaina Mudenda, ZMW 810)
where the CSV showed it on 2026-09-10 and MoneyWise showed it on 2026-09-09 — same reference, same
amount, genuinely the same payment, just filed under the wrong calendar day in MoneyWise. Root
cause, confirmed by reading source: `dateOnly()` in
`apps/api/src/services/masterfees.service.ts:249`:

```ts
const dateOnly = (v?: string): string => (v ? String(v).slice(0, 10) : new Date().toISOString().slice(0, 10));
```

This slices the first 10 characters of a UTC ISO timestamp string with **no timezone conversion**.
Zambia is UTC+2 (CAT, no DST) — confirmed via the CSV's own Details column, which embeds the real
mobile-money receipt timestamp (`"<name> MP<yymmdd>.<hhmm>.<code>"`) and always matches the CSV's
own Date column to the minute, i.e. the CSV is in local Zambia time. So any payment whose
`completed_at` falls in **22:00:00–23:59:59 UTC** (00:00–01:59 the next day in Zambia) gets written
to `cashbook_entries.date` — and therefore the org's actual financial ledger, daily reports, and
this reconciliation — as the day *before* it really happened. Confirmed live: **386 PAYMENT records**
org-wide (Twalumbu) since April 2026 fall in that UTC window; **6 of them land inside the Aug 1–Sep
14 2026 reconciliation window** used in this session (`REF-1787127394959-734-I1/I2`,
`REF-1787609106248-642`, `REF-1788651499306-954-I1/I2`, `REF-1788995987350-263`).

**This script must always bucket a MoneyWise date using local time, never raw UTC** — fixed via
`ORG_TZ_OFFSET = timedelta(hours=2)` applied in `load_masterfees_rows()` before taking `.date()`.
Before this fix, the script *reproduced* MoneyWise's own bug (bucketing by raw UTC date too), which
is why the Lushomo transaction showed as a correct 1:1 `MATCH` by reference but still produced a
~ZMW 810 daily-total gap on both the 9th and the 10th — the pairing was right, the day-bucketing
wasn't. Each affected row also carries `moneywise_date_bug: true` (surfaced as a blue "MoneyWise
Date Bug?" column in the Detail tabs) so the pattern is visible per-transaction, not just silently
absorbed into a now-correct total.

**What this script does NOT do**: correct the underlying `cashbook_entries.date` values in
production. That's a real financial-ledger data correction (386 rows since April, affecting
whatever daily/monthly reports the school already pulled) that needs the app's own
`cashbookService.recalculateBalancesFrom()` / `ledgerService.repostForCashbookEntry()` machinery to
keep the running-balance chain consistent — a raw `UPDATE cashbook_entries SET date = ...` would
desync the balance chain the same way the app's own comments warn about elsewhere in
`masterfees.service.ts`.

**UPDATE — both now done (2026-09-14)**: `dateOnly()` fixed in
`apps/api/src/services/masterfees.service.ts` to convert to Zambia local time before truncating.
Backfill run via `apps/api/src/scripts/backfill_masterfees_date_bug.ts` (`DRY_RUN=true` first,
backup written before any write) — but **not all 386 flagged rows were touched**: it only corrects a
row when its current `cashbook_entries.date` is *exactly* the literal UTC-truncated `completed_at`
string, the unambiguous fingerprint of this one bug. Investigation found 12 rows (the entire `IMP-`
bulk-import batch mostly fit the pattern, but 8 of its rows and 4 `MAN-` manual payments had dates
off by weeks-to-months, clearly set by some other process — correcting those via this bug's logic
would have overwritten a possibly-correct date with a wrong one) — those 12 were deliberately
skipped and logged, not backfilled blindly. 374 corrected. The script's own balance-recalc step also
had an unpaginated fetch (same class of bug as the candidate-fetch fix below) that silently capped
two large chains at 1000 rows each — caught immediately after the live run by checking actual row
counts against the "N entries recalculated" log line, fixed with a follow-up paginated full
recompute (`apps/api/src/scripts/fix_recalc_pagination.ts`). Lesson: **always paginate every
Supabase-JS `.select()` against `cashbook_entries`/`masterfees_records` in a script — this org
has thousands of rows in both, past the default 1000-row cap, and it will silently truncate twice
in one sitting if you don't watch for it.**

### Split-invoice payments: one Lenco deposit, several MoneyWise records (the seventh fix)

MasterFees sometimes splits ONE real payment across several children/invoices by suffixing one
shared reference with `-I1`, `-I2`, `-I3`, ... — each sibling gets its own `masterfees_records`
PAYMENT row (own amount, `completed_at` seconds apart), but the Lenco wallet only ever recorded
**one** deposit for the whole payment. Caught live: CSV showed one `Cleared`, no-receipt deposit of
ZMW 9,032.02 ("patrick lungu ..."); MoneyWise had three records —
`REF-1788948685550-801-I1/I2/I3` (Joana, Patrick, Theresa Chisulo — siblings) — summing to
ZMW 9,121.00, about 1% more (a settlement fee). Passes 1 and 2 both match one CSV row to at most one
MoneyWise record, so every sibling fell through as its own spurious "missing" gap.

Fixed with a third pass, `match_split_groups()`: group whatever MoneyWise records passes 1+2 left
unmatched by `(date, base_ref(external_reference))` — `base_ref()` strips a trailing `-I<n>` — and
for any group with **more than one** member, match a still-unmatched CSV deposit against the
**group's sum** (`group_tolerance()`: max(K2, 3% of the sum), covering the settlement fee) rather
than any single sibling. A lone leftover record (no siblings) isn't a split family and stays
untouched. Each sibling still gets its own row in the Detail sheet (its own date/amount, its own
`(timestamp, amount)` raw-sheet lookup key) but they all share one group-level status: `MATCH
(GROUPED)` when the CSV total equals the sum exactly, `MATCH (GROUPED, fee-adjusted)` when it's
within tolerance (the Difference column always shows the real gap, per-row, so nothing is hidden —
"flag it but still match it," per the user's own instruction), or `AMOUNT MISMATCH (GROUPED)` if
even the tolerance doesn't cover it. Colored teal (not plain green) so a grouped match still reads
as "worth a glance," not identical to an ordinary 1:1 match. Re-running Twalumbu Aug–Sep 2026 found
6 split families (14 sibling rows) this way — missing-in-moneywise dropped from 49 to 43,
missing-in-csv from 79 to 65. **Never match a group against a single sibling's amount** — always the
full group sum; matching against fewer than the whole family will just misreport the family's other
members as unrelated new gaps.

## Known caveats / things to double check each run

- **CSV export completeness**: MoneyWise's wallet-history export may cap at a fixed row count. If
  the number of MasterFees Lenco payments in the period is much larger than the number of CSV rows,
  ask the user to re-export with a narrower date range (e.g. week-by-week) rather than reporting
  hundreds of false "missing in CSV" gaps.
- **Multiple real transactions sharing one receipt number**: seen in real data (e.g. the same
  reference appearing 4x for the same student/amount, across different days). Handled by
  per-transaction nearest-timestamp matching (see above) — each surfaces as its own row, not a
  lumped total. Don't reintroduce sum-and-diff-by-reference; it hides genuine per-transaction gaps.
- **SPLIT- references are always manual**: `SPLIT-REF-...` looks Lenco-shaped but is generated
  whenever staff split one manually-entered payment across multiple children's fee categories —
  every one checked live for this org was `payment_method='manual'`. `channel_of()` correctly puts
  these in the Manual channel (see "Channel classification must mirror the app exactly" above).
  Don't special-case them back into the Lenco channel.
- **The CSV file on disk can change shape between runs**: caught live 2026-09-14 — the same
  Downloads path that had `Date, Description, Details, Receipt Number, Source, Payer Name, Student,
  Type, Status, Amount, Balance` earlier in a session had been silently resaved (by Excel/Numbers,
  most likely — opening and saving a CSV commonly reformats it) to just `Date, Details, Receipt
  Number, Source, Payer Name, Student, Amount, Column1` an hour later, with `Type`/`Status`/`Balance`
  gone and dates reformatted from `DD/MM/YY HH:MM` to `D/M/YYYY H:MM`. Without `Type`/`Status` this
  script can't tell deposits from outflows/refunds or verified from pending at all — it will either
  crash (current behavior: `load_csv` requires these columns) or, if that guard is ever loosened,
  silently misclassify everything. **Before trusting a re-run's output, re-check the CSV's actual
  column headers** (`csv.DictReader(...).fieldnames`) match what `load_csv` expects; if they don't,
  ask the user for a fresh, unedited export rather than guessing at a new column mapping.
- Amounts compare with a 1-cent tolerance to absorb floating point noise.

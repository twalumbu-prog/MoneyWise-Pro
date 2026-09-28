#!/usr/bin/env python3
"""
MasterFees <-> MoneyWise wallet reconciliation.

Compares the MasterFees payments recorded in MoneyWise (masterfees_records,
record_type='PAYMENT', mf_status='success') for one organization against a
Lenco wallet-history CSV exported from MoneyWise, and produces a color-coded
Excel workbook of matches / gaps.

Usage:
    python3 reconcile.py --org-name "Twalumbu Education Centre" \
        --csv /path/to/wallet-history.csv \
        --out /path/to/Reconciliation.xlsx

    # or by organization id directly:
    python3 reconcile.py --org-id <uuid> --csv ... --out ...

Requires DATABASE_URL (or --db-url) pointing at the MoneyWise Postgres/Supabase
database - by default this is read from apps/api/.env in the repo.

Reference-channel logic
------------------------
MasterFees payment references come in two flavors:
  - REF- / SPLIT-REF- / REC-   -> collected electronically through Lenco.
    The money physically lands in the Lenco wallet this CSV is exported
    from, so these are reconciled against the CSV.
  - MAN-                        -> a staff member logged the payment
    manually (parent paid into a different bank / cash). This money never
    touches the Lenco wallet, so it's reported separately for context only
    and is NOT counted as a reconciliation gap.
"""
import argparse
import csv
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, date, timedelta

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

TOLERANCE = 0.01

# Zambia is UTC+2 year-round (CAT, no DST). The CSV wallet-history export's
# dates are in local time (confirmed live: mobile-money receipt codes embedded
# in the Details column, e.g. "MP260910.0124", match the CSV's own Date column
# to the minute - that's the ground-truth local transaction time). MoneyWise's
# own `masterfees_records.raw.completed_at` is correctly stored as UTC, but a
# bug in `apps/api/src/services/masterfees.service.ts`'s `dateOnly()`
# (`String(v).slice(0, 10)`, no timezone conversion) mis-dates any payment
# completing between 22:00-23:59:59 UTC (00:00-01:59 the next day in Zambia)
# to the WRONG, earlier calendar day in cashbook_entries.date - confirmed live
# for org e359c84e-b42b-4b0a-b422-a2074d87d83a (Twalumbu): 386 PAYMENT records
# since April 2026 hit this window. This script must NOT reproduce that bug:
# always bucket a MoneyWise timestamp's calendar day using ORG_TZ_OFFSET,
# never the raw UTC date, or every daily-total comparison will show a phantom
# gap on both the correct day (CSV) and the wrong day (MoneyWise) for the
# same real, matched transaction.
ORG_TZ_OFFSET = timedelta(hours=2)

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DEFAULT_ENV_FILE = os.path.join(REPO_ROOT, "apps", "api", ".env")


# --------------------------------------------------------------------------
# DB access
# --------------------------------------------------------------------------

def load_db_url_from_env_file(path):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                val = line.split("=", 1)[1].strip()
                return val.strip('"').strip("'")
    return None


def fetch_org_id(conn, org_name):
    with conn.cursor() as cur:
        cur.execute("select id, name from organizations where name ilike %s", (f"%{org_name}%",))
        rows = cur.fetchall()
    if not rows:
        sys.exit(f"No organization found matching '{org_name}'")
    if len(rows) > 1:
        options = "\n".join(f"  - {name} ({oid})" for oid, name in rows)
        sys.exit(f"Multiple organizations match '{org_name}', pass --org-id instead:\n{options}")
    return rows[0][0]


def fetch_masterfees_payments(conn, org_id, date_min, date_max):
    query = """
        select
            external_reference,
            mf_reference,
            student_name,
            amount,
            (raw->>'completed_at')::timestamptz as completed_at
        from masterfees_records
        where organization_id = %s
          and record_type = 'PAYMENT'
          and mf_status = 'success'
          and (raw->>'completed_at')::timestamptz >= %s
          and (raw->>'completed_at')::timestamptz < %s
        order by completed_at
    """
    with conn.cursor() as cur:
        cur.execute(query, (org_id, date_min, date_max))
        cols = [c.name for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    return rows


# --------------------------------------------------------------------------
# Parsing
# --------------------------------------------------------------------------

def parse_amount(s):
    s = s.replace("ZMW", "").replace(",", "").strip()
    neg = s.startswith("-")
    s = s.lstrip("-").strip()
    val = float(s) if s else 0.0
    return -val if neg else val


def parse_csv_date(s):
    # MoneyWise wallet-history export format, e.g. "14/09/26 09:47"
    for fmt in ("%d/%m/%y %H:%M", "%d/%m/%Y %H:%M"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date format: {s!r}")


def channel_of(ref):
    """Mirrors apps/api/src/services/masterfees.service.ts isLencoProcessed()
    EXACTLY - that function is what actually decides, at posting time, whether
    a payment is treated as Lenco-processed (and therefore expected to show up
    in this wallet CSV) or manually recorded. Only a strict 'REF-' prefix
    counts; every other prefix - including SPLIT-REF-, REC-, MAN-, BNK- - is
    manual, no matter how "Lenco-ish" the format looks.

    Verified live 2026-09-14: EVERY masterfees_records row with a SPLIT- prefix
    for this org has raw.payment_method='manual' (splitting one manually-typed
    payment across several children's invoices generates a synthetic
    'SPLIT-REF-<n>-<i>-<suffix>' reference - it does NOT mean the underlying
    payment went through Lenco). Treating SPLIT-/REC- as Lenco (the first
    version of this script's assumption) produced a false "missing in CSV"
    gap for a payment that was never supposed to be in this wallet at all,
    AND whose completed_at reflects when staff typed it into MasterFees, not
    the real transaction date - both are explained by it being manual.
    """
    return "LENCO" if ref.upper().startswith("REF-") else "MANUAL"


_INVOICE_SPLIT_SUFFIX = re.compile(r"-I\d+$", re.IGNORECASE)


def base_ref(ref):
    """Strip a trailing '-I<n>' invoice-split suffix, e.g.
    'REF-1788948685550-801-I2' -> 'REF-1788948685550-801'.

    MasterFees splits ONE Lenco payment across multiple children/invoices by
    appending '-I1', '-I2', '-I3', ... to the same base reference - each
    sibling gets its own masterfees_records PAYMENT row (its own amount,
    completed_at seconds apart), but the Lenco wallet only ever recorded ONE
    deposit for the whole payment. Confirmed live 2026-09-09: CSV shows one
    Cleared, no-receipt deposit for ZMW 9,032.02 ("patrick lungu ..."); the
    three MoneyWise records REF-1788948685550-801-I1/I2/I3 (Joana Chisulo,
    Patrick Chisulo, Theresa Chisulo - siblings) sum to ZMW 9,121.00, ~1% more
    (a Lenco/mobile-money settlement fee), same day, seconds apart. Matching
    each -I<n> record individually against the CSV total fails every time;
    grouping by this base reference and comparing the SUM is what actually
    reconciles it - see match_split_groups().
    """
    return _INVOICE_SPLIT_SUFFIX.sub("", ref)


def categorize_csv_row(r):
    """Every CSV row gets a category, even ones excluded from the reference-based
    fee-payment reconciliation - nothing from the CSV (the source of truth) is
    silently dropped from the raw output, only from the narrower match-by-
    reference view.

    A 'Cleared' Income row from Source=Lenco with NO receipt number is still a
    real MasterFees/Lenco deposit - confirmed live: its Details field carries
    the same mobile-money transaction signature ("<name> MP<yymmdd>.<hhmm>.
    <code>") as every genuine 'Verified' fee payment, just without a receipt
    number MoneyWise's own matching could attach. It is NOT "other income" to
    be waved off - it's a payment MoneyWise's Lenco sync captured but never
    linked to a MasterFees record, and it must be matched (by date+amount,
    since there's no reference to key on) or flagged as a real gap. Only an
    Income row that is genuinely not Lenco-sourced falls back to a neutral
    'other income' bucket - none seen in practice so far, but the CSV could
    contain one.
    """
    if r["type"] != "Income":
        return "OUTFLOW / REFUND (not a deposit)"
    if r["status"] == "Verified" and r["receipt_number"]:
        return "LENCO FEE PAYMENT" if channel_of(r["receipt_number"]) == "LENCO" else "MANUAL FEE PAYMENT"
    if not r["receipt_number"] and r["source"] == "Lenco":
        return "LENCO FEE PAYMENT (no receipt - matched by date+amount)"
    return "OTHER INCOME (not a verified fee payment)"


def load_csv(path):
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            dt = parse_csv_date(r["Date"])
            rows.append({
                "datetime": dt,
                "date": dt.date(),
                "description": r.get("Description") or r.get("Details") or "",
                "receipt_number": r["Receipt Number"].strip(),
                "source": r["Source"],
                "payer_name": r["Payer Name"],
                "student": r["Student"],
                "type": r["Type"],
                "status": r["Status"],
                "amount": parse_amount(r["Amount"]),
            })
    return rows


def load_masterfees_rows(db_rows):
    rows = []
    for r in db_rows:
        dt = r["completed_at"]
        if dt.tzinfo is not None:
            dt = dt.replace(tzinfo=None)  # naive-UTC, matches the CSV's own naive datetimes for comparison
        ref = (r.get("external_reference") or "").strip()
        raw_utc_date = dt.date()
        local_date = (dt + ORG_TZ_OFFSET).date()
        rows.append({
            "datetime": dt,
            # Calendar day for all bucketing/matching, in the org's local time
            # (see ORG_TZ_OFFSET) - NOT the raw UTC date, which the app's own
            # dateOnly() bug uses and which can be a day earlier than reality
            # for anything completing 22:00-23:59:59 UTC.
            "date": local_date,
            "date_shifted_from_utc": local_date != raw_utc_date,
            "external_reference": ref,
            "student_name": r["student_name"],
            "amount": float(r["amount"]),
            "channel": channel_of(ref),
        })
    return rows


# --------------------------------------------------------------------------
# Reconciliation
# --------------------------------------------------------------------------

def match_items_within_ref(csv_items, mf_items):
    """Pair individual CSV rows to individual MoneyWise records sharing one
    reference, by nearest timestamp - NOT by summing the group and diffing
    totals.

    Multiple real, distinct payments can share one MasterFees reference (seen
    live: 4 separate CSV transactions for the same student/reference across
    two days, ZMW 140 each, but only 1 of them had a matching MoneyWise
    record). Summing csv_total vs mf_total for the whole group collapses that
    into one vague "amount mismatch" and hides which specific transactions
    never made it into MoneyWise. Nearest-timestamp 1:1 pairing instead
    produces one row per real transaction, so an unmatched payment shows up
    with its own date/time/amount - actionable, not buried in a total.
    """
    remaining_csv = list(csv_items)
    remaining_mf = list(mf_items)
    pairs = []  # (csv_item_or_None, mf_item_or_None)

    while remaining_csv and remaining_mf:
        best = None
        best_delta = None
        for c in remaining_csv:
            for m in remaining_mf:
                delta = abs((c["datetime"] - m["datetime"]).total_seconds())
                if best_delta is None or delta < best_delta:
                    best_delta = delta
                    best = (c, m)
        c, m = best
        pairs.append((c, m))
        remaining_csv.remove(c)
        remaining_mf.remove(m)

    for c in remaining_csv:
        pairs.append((c, None))
    for m in remaining_mf:
        pairs.append((None, m))

    return pairs


def match_no_reference_rows(csv_no_ref, leftover_mf):
    """Second-pass matcher for CSV deposits that have NO receipt number to key
    on (Lenco 'Cleared' rows MoneyWise's own sync never attached a reference
    to) - these are still real Lenco deposits, not something to wave off as
    "other income". Match them against MoneyWise records that the reference-
    based pass in build_ref_results left unmatched (`leftover_mf`), requiring
    same calendar date AND an exact amount (tight, because there's no
    reference to disambiguate - a loose date/amount match here would produce
    false positives). Nearest-timestamp among valid (same-day, same-amount)
    candidates, greedy. Anything left over on the CSV side is a genuine
    "MasterFees payment never synced to MoneyWise" gap; anything left over
    on the MoneyWise side just stays part of the normal leftover_mf pool.

    Returns (pairs, still_unmatched_mf) - pairs is [(csv_item, mf_item_or_None
    for unmatched csv rows)], still_unmatched_mf is leftover_mf minus whatever
    got consumed here (the caller uses this to avoid double-reporting a
    MoneyWise record as missing once it's matched here).
    """
    remaining_csv = list(csv_no_ref)
    remaining_mf = list(leftover_mf)
    pairs = []

    while remaining_csv and remaining_mf:
        best = None
        best_delta = None
        for c in remaining_csv:
            for m in remaining_mf:
                if c["date"] != m["date"] or abs(c["amount"] - m["amount"]) > TOLERANCE:
                    continue
                delta = abs((c["datetime"] - m["datetime"]).total_seconds())
                if best_delta is None or delta < best_delta:
                    best_delta = delta
                    best = (c, m)
        if best is None:
            break
        c, m = best
        pairs.append((c, m))
        remaining_csv.remove(c)
        remaining_mf.remove(m)

    for c in remaining_csv:
        pairs.append((c, None))

    return pairs, remaining_mf


def group_tolerance(amount):
    """Fee/rounding tolerance for a grouped-split-payment match: the mobile-
    money/Lenco settlement skims a cut before the wallet sees it (confirmed
    live: ~1% on a ZMW 9,121 group of siblings). Generous enough to catch a
    real fee-driven difference, tight enough that combining it with the
    already-strong base-reference/same-day grouping signal won't produce
    false positives."""
    return max(2.0, round(amount * 0.03, 2))


def match_split_groups(csv_candidates, leftover_mf):
    """Third pass: MasterFees splits ONE Lenco payment across several
    children/invoices by suffixing one shared reference with '-I1', '-I2',
    '-I3', ... (see base_ref()) - each sibling gets its own masterfees_records
    PAYMENT row, but the Lenco wallet only ever recorded ONE deposit for the
    whole payment. Passes 1 (build_ref_results) and 2
    (match_no_reference_rows) both match 1 CSV row to AT MOST 1 MoneyWise
    record, so every one of these siblings falls through as an individual,
    spurious "missing" gap. This pass groups still-unmatched MoneyWise
    records by (date, base_ref) and matches a still-unmatched CSV deposit
    against the GROUP'S SUM (within group_tolerance(), for the settlement
    fee), not any single item.

    Only groups with more than one member are considered - a lone leftover
    record isn't a split family, it's just still missing, and stays in the
    leftover pool untouched.

    Returns (matched, still_unmatched_csv, still_unmatched_mf) where matched
    is [(csv_item, [mf_item, ...]), ...].
    """
    groups = defaultdict(list)
    for m in leftover_mf:
        groups[(m["date"], base_ref(m["external_reference"]))].append(m)
    groups = {k: v for k, v in groups.items() if len(v) > 1}
    grouped_ids = {id(m) for items in groups.values() for m in items}
    untouched_mf = [m for m in leftover_mf if id(m) not in grouped_ids]

    remaining_csv = list(csv_candidates)
    remaining_groups = dict(groups)
    matched = []

    while remaining_csv and remaining_groups:
        best = None
        best_score = None
        for c in remaining_csv:
            for key, items in remaining_groups.items():
                gdate, gbase = key
                if c["date"] != gdate:
                    continue
                group_sum = sum(m["amount"] for m in items)
                diff = abs(c["amount"] - group_sum)
                if diff > group_tolerance(group_sum):
                    continue
                # Prefer the CSV row's own receipt number actually being this
                # base reference (rare but possible) over a pure amount
                # coincidence; then prefer the smallest absolute difference.
                exact_ref = 0 if (c["receipt_number"] and base_ref(c["receipt_number"]) == gbase) else 1
                score = (exact_ref, diff)
                if best_score is None or score < best_score:
                    best_score = score
                    best = (c, key)
        if best is None:
            break
        c, key = best
        matched.append((c, remaining_groups[key]))
        remaining_csv.remove(c)
        del remaining_groups[key]

    still_unmatched_mf = untouched_mf + [m for items in remaining_groups.values() for m in items]
    return matched, remaining_csv, still_unmatched_mf


def group_pair_to_results(ref, c, mf_group):
    """Like pair_to_result(), but for one CSV deposit matched against a GROUP
    of MoneyWise records (see match_split_groups()) - one output row per
    group member so each still gets its own correct (timestamp, amount) raw-
    sheet lookup key, all sharing the same group-level status/diff."""
    group_sum = round(sum(m["amount"] for m in mf_group), 2)
    csv_total = round(c["amount"], 2)
    diff = round(csv_total - group_sum, 2)
    if abs(diff) <= TOLERANCE:
        status = "MATCH (GROUPED)"
    elif abs(diff) <= group_tolerance(group_sum):
        status = "MATCH (GROUPED, fee-adjusted)"
    else:
        status = "AMOUNT MISMATCH (GROUPED)"
    display_ref = f"{ref} (+{len(mf_group) - 1} more)"
    results = []
    for m in mf_group:
        mf_total = round(m["amount"], 2)
        results.append({
            "ref": ref,
            "display_ref": display_ref,
            "multi_transaction_ref": True,
            "csv_count": 1,
            "csv_total": csv_total,
            "csv_students": c["student"],
            "csv_dates": c["datetime"].isoformat(sep=" "),
            "csv_key": (c["datetime"].isoformat(sep=" "), csv_total),
            "mf_count": 1,
            "mf_total": mf_total,
            "mf_students": m["student_name"],
            "mf_dates": m["datetime"].isoformat(sep=" "),
            "mf_key": (m["datetime"].isoformat(sep=" "), mf_total),
            "moneywise_date_bug": bool(m.get("date_shifted_from_utc")),
            "diff": diff,  # group-level diff (CSV total vs group sum), same on every row
            "status": status,
        })
    return results


def pair_to_result(ref, c, m, multi=False, display_ref=None):
    csv_total = round(c["amount"], 2) if c else 0.0
    mf_total = round(m["amount"], 2) if m else 0.0
    diff = round(csv_total - mf_total, 2)
    if c and m:
        status = "MATCH" if abs(diff) <= TOLERANCE else "AMOUNT MISMATCH"
    elif c and not m:
        status = "MISSING IN MONEYWISE"
    else:
        status = "MISSING IN LENCO CSV"
    return {
        "ref": ref,
        # What the "Receipt / Reference" column shows - usually same as `ref`,
        # but for a date+amount match (no receipt number in the CSV) `ref` is
        # kept as the CSV's real (empty) receipt number for lookup purposes
        # while this carries the MoneyWise reference that was actually matched.
        "display_ref": display_ref if display_ref is not None else ref,
        "multi_transaction_ref": multi,
        "csv_count": 1 if c else 0,
        "csv_total": csv_total,
        "csv_students": c["student"] if c else "",
        "csv_dates": c["datetime"].isoformat(sep=" ") if c else "",
        # (datetime, amount) lookup key, robust even when `ref` is blank/reused.
        "csv_key": (c["datetime"].isoformat(sep=" "), csv_total) if c else None,
        "mf_count": 1 if m else 0,
        "mf_total": mf_total,
        "mf_students": m["student_name"] if m else "",
        "mf_dates": m["datetime"].isoformat(sep=" ") if m else "",
        "mf_key": (m["datetime"].isoformat(sep=" "), mf_total) if m else None,
        # True when this MoneyWise record's completed_at falls 22:00-23:59:59
        # UTC, meaning MoneyWise's own ledger date (cashbook_entries.date) is
        # ONE DAY EARLIER than the real local transaction day this script uses
        # - a known app bug (dateOnly() in masterfees.service.ts), not a
        # reconciliation error. Surfaced so the pattern is visible per-row,
        # not just fixed silently.
        "moneywise_date_bug": bool(m and m.get("date_shifted_from_utc")),
        "diff": diff,
        "status": status,
    }


def build_ref_results(csv_items_by_ref, mf_items_by_ref):
    """One row per individual transaction (not per reference-total)."""
    all_refs = sorted(set(csv_items_by_ref) | set(mf_items_by_ref))
    results = []
    for ref in all_refs:
        csv_items = csv_items_by_ref.get(ref, [])
        mf_items = mf_items_by_ref.get(ref, [])
        pairs = match_items_within_ref(csv_items, mf_items)
        multi = len(csv_items) > 1 or len(mf_items) > 1
        for c, m in pairs:
            results.append(pair_to_result(ref, c, m, multi))
    return results


def build_daily_results(csv_items, mf_items):
    csv_daily = defaultdict(float)
    for r in csv_items:
        csv_daily[r["date"]] += r["amount"]
    mf_daily = defaultdict(float)
    for r in mf_items:
        mf_daily[r["date"]] += r["amount"]
    all_dates = sorted(set(csv_daily) | set(mf_daily))
    results = []
    for d in all_dates:
        c = round(csv_daily.get(d, 0.0), 2)
        m = round(mf_daily.get(d, 0.0), 2)
        diff = round(c - m, 2)
        status = "MATCH" if abs(diff) <= TOLERANCE else "GAP"
        results.append({"date": d, "csv_total": c, "mf_total": m, "diff": diff, "status": status})
    return results


def by_ref(items, key):
    d = defaultdict(list)
    for r in items:
        d[r[key]].append(r)
    return d


# --------------------------------------------------------------------------
# Excel output
# --------------------------------------------------------------------------

GREEN = PatternFill("solid", fgColor="C6EFCE")
RED = PatternFill("solid", fgColor="FFC7CE")
YELLOW = PatternFill("solid", fgColor="FFEB9C")
ORANGE = PatternFill("solid", fgColor="FFD9B3")
GREY = PatternFill("solid", fgColor="F2F2F2")
BLUE = PatternFill("solid", fgColor="BDD7EE")
DATE_BUG_FILL = BLUE
HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
HEADER_FONT = Font(color="FFFFFF", bold=True)
THIN = Side(style="thin", color="D9D9D9")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

TEAL = PatternFill("solid", fgColor="A9D9D0")

STATUS_FILL = {
    "MATCH": GREEN,
    "AMOUNT MISMATCH": RED,
    "MISSING IN MONEYWISE": ORANGE,
    "MISSING IN LENCO CSV": YELLOW,
    "GAP": RED,
    # One payment split across siblings' invoices in MasterFees but recorded
    # as a single Lenco deposit - matched against the group's SUM, not a
    # single item (see match_split_groups()). Teal, not plain green, so it
    # reads as "matched, but check the grouping" rather than an ordinary 1:1 match.
    "MATCH (GROUPED)": TEAL,
    "MATCH (GROUPED, fee-adjusted)": TEAL,
    "AMOUNT MISMATCH (GROUPED)": RED,
}


def style_header(ws, ncols, row=1):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = BORDER
    ws.freeze_panes = ws.cell(row=row + 1, column=1)


def autofit(ws, widths):
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def write_daily_block(ws, daily_results, start_row, title):
    ws.cell(row=start_row - 1, column=1, value=title).font = Font(bold=True, size=12)
    headers = ["Date", "Lenco CSV Total (ZMW)", "MoneyWise Total (ZMW)", "Difference", "Status"]
    for i, h in enumerate(headers, start=1):
        ws.cell(row=start_row, column=i, value=h)
    style_header(ws, len(headers), row=start_row)
    row = start_row + 1
    for r in daily_results:
        ws.cell(row=row, column=1, value=r["date"].isoformat())
        ws.cell(row=row, column=2, value=r["csv_total"]).number_format = "#,##0.00"
        ws.cell(row=row, column=3, value=r["mf_total"]).number_format = "#,##0.00"
        ws.cell(row=row, column=4, value=r["diff"]).number_format = "#,##0.00"
        ws.cell(row=row, column=5, value=r["status"])
        fill = STATUS_FILL.get(r["status"], GREY)
        for c in range(1, 6):
            ws.cell(row=row, column=c).fill = fill
            ws.cell(row=row, column=c).border = BORDER
        row += 1
    return row


def write_ref_sheet(wb, name, ref_results, note=None):
    ws = wb.create_sheet(name)
    row0 = 1
    if note:
        ws.cell(row=1, column=1, value=note).font = Font(italic=True)
        row0 = 3
    headers = [
        "Receipt / Reference", "Shared Ref?", "Status", "Difference (ZMW)",
        "CSV Date/Time", "CSV Student", "CSV Amount (ZMW)",
        "MoneyWise Date/Time", "MoneyWise Student", "MoneyWise Amount (ZMW)",
        "MoneyWise Date Bug?",
    ]
    for i, h in enumerate(headers, start=1):
        ws.cell(row=row0, column=i, value=h)
    style_header(ws, len(headers), row=row0)
    row = row0 + 1
    # One row per real transaction; order by status (problems first) then by
    # whichever timestamp is available, so same-day gaps sit together.
    _GOOD_STATUSES = ("MATCH", "MATCH (GROUPED)", "MATCH (GROUPED, fee-adjusted)")
    for r in sorted(ref_results, key=lambda x: (x["status"] in _GOOD_STATUSES, x["csv_dates"] or x["mf_dates"])):
        fill = STATUS_FILL.get(r["status"], GREY)
        vals = [
            r["display_ref"], ("Yes - multiple transactions share this reference" if r["multi_transaction_ref"] else ""),
            r["status"], r["diff"],
            r["csv_dates"], r["csv_students"], (r["csv_total"] if r["csv_count"] else None),
            r["mf_dates"], r["mf_students"], (r["mf_total"] if r["mf_count"] else None),
            ("Yes - MoneyWise recorded this a day earlier (dateOnly() UTC bug), corrected here" if r["moneywise_date_bug"] else ""),
        ]
        for c, v in enumerate(vals, start=1):
            cell = ws.cell(row=row, column=c, value=v)
            cell.fill = DATE_BUG_FILL if (c == 11 and r["moneywise_date_bug"]) else fill
            cell.border = BORDER
            if c in (4, 7, 10):
                cell.number_format = "#,##0.00"
        row += 1
    autofit(ws, [26, 36, 20, 14, 18, 26, 14, 18, 26, 16, 44])
    ws.auto_filter.ref = f"A{row0}:{get_column_letter(len(headers))}{row - 1}"
    return ws


def build_workbook(org_label, out_path, lenco_ref_results, manual_ref_results, lenco_daily, manual_daily,
                    all_csv_rows, mf_lenco, date_min, date_max):
    wb = openpyxl.Workbook()

    ws = wb.active
    ws.title = "Summary"
    ws["A1"] = "MasterFees <-> MoneyWise Reconciliation"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = org_label
    ws["A2"].font = Font(bold=True, size=11)
    ws["A3"] = f"Period: {date_min.isoformat()} to {date_max.isoformat()}"
    ws["A4"] = f"Generated: {datetime.now().isoformat(timespec='seconds')}"
    ws["A5"] = (
        "Scope: only MasterFees payments collected through Lenco (references starting REF-/SPLIT-REF-/REC-) "
        "are reconciled against this Lenco wallet CSV. MAN- (manually recorded) payments were paid into a "
        "different bank and are shown separately for context - they are not expected to appear in this CSV. "
        "Matching is per INDIVIDUAL transaction (nearest timestamp), not per reference-total: when one "
        "reference covers several real payments (a parent paying the same invoice more than once), each "
        "payment is checked and shown on its own row in the Detail tabs, so a genuinely unmatched transaction "
        "is never hidden inside a lumped total. All MoneyWise dates below use Zambia local time (UTC+2), not "
        "MoneyWise's own raw UTC date - see 'MoneyWise Date Bug?' in the Detail tabs for a known app bug "
        "(dateOnly() in masterfees.service.ts) that mis-dates payments completing 22:00-23:59:59 UTC to the "
        "wrong (earlier) day in MoneyWise's own ledger."
    )
    ws["A5"].font = Font(italic=True, size=9)
    ws["A5"].alignment = Alignment(wrap_text=True)
    ws.merge_cells("A5:E5")
    ws.row_dimensions[5].height = 70

    csv_grand = round(sum(r["csv_total"] for r in lenco_daily), 2)
    mf_grand = round(sum(r["mf_total"] for r in lenco_daily), 2)
    ws["A7"] = "Lenco channel - CSV total (ZMW)"
    ws["B7"] = csv_grand
    ws["A8"] = "Lenco channel - MoneyWise total (ZMW)"
    ws["B8"] = mf_grand
    ws["A9"] = "Difference (ZMW)"
    ws["B9"] = round(csv_grand - mf_grand, 2)
    ws["B9"].fill = GREEN if abs(csv_grand - mf_grand) <= TOLERANCE else RED
    for r in (7, 8, 9):
        ws[f"B{r}"].number_format = "#,##0.00"
        ws[f"A{r}"].font = Font(bold=True)

    next_row = write_daily_block(ws, lenco_daily, 12, "Daily totals - Lenco channel (the actual reconciliation)")
    write_daily_block(ws, manual_daily, next_row + 2, "Daily totals - Manual channel (informational only, different bank)")
    autofit(ws, [14, 26, 26, 14, 16])

    write_ref_sheet(wb, "Lenco Channel Detail", lenco_ref_results)
    write_ref_sheet(
        wb, "Manual Channel Detail", manual_ref_results,
        note="Informational only - MAN- payments were paid into a different bank account, not this Lenco wallet. "
             "'MISSING IN LENCO CSV' here is expected, not a real gap.",
    )

    # Keyed by (own timestamp, own amount) - not by reference - because a
    # reference can be blank (date+amount-only matches) or shared by several
    # real transactions (see match_items_within_ref / match_no_reference_rows),
    # so it alone can't identify one specific row. Separate dicts per channel.
    lenco_csv_status_by_key = {r["csv_key"]: r["status"] for r in lenco_ref_results if r["csv_count"]}
    mf_status_by_key = {r["mf_key"]: r["status"] for r in lenco_ref_results if r["mf_count"]}
    manual_csv_status_by_key = {r["csv_key"]: r["status"] for r in manual_ref_results if r["csv_count"]}

    # This sheet is the CSV's full source of truth - EVERY row from the
    # export, unfiltered (deposits, outflows, refunds, non-fee inflows all
    # included), not just the subset that made it into the Lenco-channel
    # reconciliation. A "Category" column says why a row is/isn't part of the
    # fee-payment matching above, and matched fee-payment rows carry their
    # real reconciliation status and color; everything else is neutral grey.
    ws3 = wb.create_sheet("Raw - Full Lenco CSV")
    ws3["A1"] = (
        "Every row from the wallet-history CSV export, in original order - nothing filtered out. "
        "'Category' explains why a row is or isn't part of the fee-payment reconciliation above."
    )
    ws3["A1"].font = Font(italic=True, size=9)
    row0 = 3
    headers3 = ["Date/Time", "Type", "Status", "Category", "Reconciliation Status", "Receipt Number",
                "Source", "Payer Name", "Student", "Amount (ZMW)", "Description"]
    for i, h in enumerate(headers3, start=1):
        ws3.cell(row=row0, column=i, value=h)
    style_header(ws3, len(headers3), row=row0)
    row = row0 + 1
    for r in sorted(all_csv_rows, key=lambda x: x["datetime"]):
        category = categorize_csv_row(r)
        key = (r["datetime"].isoformat(sep=" "), round(r["amount"], 2))
        if category in ("LENCO FEE PAYMENT", "LENCO FEE PAYMENT (no receipt - matched by date+amount)"):
            recon_status = lenco_csv_status_by_key.get(key, "")
        elif category == "MANUAL FEE PAYMENT":
            recon_status = manual_csv_status_by_key.get(key, "")
        else:
            recon_status = ""
        vals = [
            r["datetime"].isoformat(sep=" "), r["type"], r["status"], category, recon_status,
            r["receipt_number"], r["source"], r["payer_name"], r["student"], r["amount"], r["description"],
        ]
        fill = STATUS_FILL.get(recon_status, GREY)
        for c, v in enumerate(vals, start=1):
            cell = ws3.cell(row=row, column=c, value=v)
            cell.fill = fill
            cell.border = BORDER
            if c == 10:
                cell.number_format = "#,##0.00"
        row += 1
    autofit(ws3, [20, 12, 12, 32, 20, 22, 10, 26, 26, 14, 50])
    ws3.auto_filter.ref = f"A{row0}:{get_column_letter(len(headers3))}{row - 1}"

    ws4 = wb.create_sheet("Raw - MoneyWise Lenco Payments")
    headers4 = ["Date/Time", "External Reference", "Student", "Amount (ZMW)"]
    for i, h in enumerate(headers4, start=1):
        ws4.cell(row=1, column=i, value=h)
    style_header(ws4, len(headers4))
    row = 2
    for r in sorted(mf_lenco, key=lambda x: x["datetime"]):
        vals = [r["datetime"].isoformat(sep=" "), r["external_reference"], r["student_name"], r["amount"]]
        fill = STATUS_FILL.get(mf_status_by_key.get((r["datetime"].isoformat(sep=" "), round(r["amount"], 2))), GREY)
        for c, v in enumerate(vals, start=1):
            cell = ws4.cell(row=row, column=c, value=v)
            cell.fill = fill
            cell.border = BORDER
            if c == 4:
                cell.number_format = "#,##0.00"
        row += 1
    autofit(ws4, [20, 26, 26, 14])
    ws4.auto_filter.ref = f"A1:{get_column_letter(len(headers4))}{row - 1}"

    ws6 = wb.create_sheet("Legend")
    ws6["A1"] = "Color legend"
    ws6["A1"].font = Font(bold=True, size=12)
    legend = [
        ("MATCH", GREEN, "This individual transaction has a same-reference counterpart on the other side with the same amount"),
        ("AMOUNT MISMATCH", RED, "Same reference, closest-in-time counterpart found on the other side, but the amount differs"),
        ("MISSING IN MONEYWISE", ORANGE, "This specific transaction landed in the Lenco wallet (has its own date/time/amount in the CSV) but has no MasterFees payment record in MoneyWise - likely a MasterFees sync gap, worth escalating"),
        ("MISSING IN LENCO CSV", YELLOW, "This specific MasterFees payment has no counterpart transaction in the CSV for this period"),
        ("MATCH (GROUPED)", TEAL, "One Lenco deposit that MasterFees split across several children/invoices (a shared "
         "'REF-...-I1/-I2/-I3' base reference) - matched here against the SUM of those sibling payments, not a single one. "
         "Every sibling shows on its own row so each keeps its own date/amount, but they all share this status."),
        ("MATCH (GROUPED, fee-adjusted)", TEAL, "Same as MATCH (GROUPED), but the CSV deposit is slightly less than the "
         "siblings' sum - a small settlement fee (confirmed live: ~1%), not a real gap. The Difference column shows the exact amount."),
        ("AMOUNT MISMATCH (GROUPED)", RED, "A split-payment family was found (same date, shared base reference) but even "
         "after allowing for a settlement fee, the CSV total and the siblings' sum don't reconcile - worth a manual look."),
        ("GAP", RED, "Daily totals differ between the two sources"),
        ("(grey / no fill)", GREY, "'Raw - Full Lenco CSV': a row that isn't a verified fee payment (an outflow, a refund, or "
         "other wallet income) - it has no reconciliation status because it isn't part of the fee-payment matching, not because "
         "it was excluded from the sheet"),
        ("MoneyWise Date Bug? = Yes", BLUE, "This transaction's date is shown correctly here (local Zambia time), but MoneyWise's "
         "own ledger (cashbook_entries.date) recorded it a day earlier - a confirmed app bug (dateOnly() in "
         "masterfees.service.ts truncates the raw UTC timestamp instead of converting to local time first, so anything "
         "completing 22:00-23:59:59 UTC lands on the wrong day in MoneyWise's own records/reports). This does NOT affect "
         "the MATCH/MISMATCH status here - the underlying transaction is correctly paired - but the school's own reports "
         "for the earlier date will look inflated and the later date deflated by this amount until it's fixed."),
    ]
    ws6["A2"] = ("'Shared Ref?' = Yes means several real transactions share one MasterFees reference; each is still "
                 "matched and colored individually by nearest timestamp, not lumped into one total. "
                 "'Raw - Full Lenco CSV' contains every row from the CSV export with no filtering - see its 'Category' "
                 "column for why each row is or isn't part of the reconciliation.")
    ws6["A2"].font = Font(italic=True, size=9)
    ws6["A2"].alignment = Alignment(wrap_text=True)
    ws6.merge_cells("A2:B2")
    ws6.row_dimensions[2].height = 40
    r = 3
    for label, fill, desc in legend:
        ws6.cell(row=r, column=1, value=label).fill = fill
        ws6.cell(row=r, column=2, value=desc)
        r += 1
    autofit(ws6, [24, 90])

    wb.save(out_path)


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def load_masterfees_json(path):
    """Load MasterFees payment rows previously fetched via the Supabase MCP tool.

    Expected shape: a JSON array of objects with external_reference, mf_reference,
    student_name, amount, completed_at (see the query in fetch_masterfees_payments /
    SKILL.md for the exact columns to select).
    """
    with open(path) as f:
        data = json.load(f)
    rows = []
    for r in data:
        raw_dt = r["completed_at"]
        raw_dt = raw_dt.replace("Z", "+00:00").replace(" ", "T", 1)
        raw_dt = re.sub(r"\+00$", "+00:00", raw_dt)
        dt = datetime.fromisoformat(raw_dt)
        rows.append({"external_reference": r.get("external_reference"), "student_name": r.get("student_name"),
                      "amount": r.get("amount"), "completed_at": dt})
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", required=True, help="Path to the MoneyWise Lenco wallet-history CSV export")
    ap.add_argument("--org-name", help="Organization name (fuzzy match), e.g. 'Twalumbu Education Centre'")
    ap.add_argument("--org-id", help="Organization UUID (use instead of --org-name if known)")
    ap.add_argument("--out", default="MasterFees_MoneyWise_Reconciliation.xlsx", help="Output .xlsx path")
    ap.add_argument("--db-url", help="Postgres connection string (defaults to DATABASE_URL in apps/api/.env)")
    ap.add_argument("--masterfees-json", help=(
        "Path to a JSON array of MasterFees payment rows already fetched (e.g. via the Supabase MCP "
        "tool - see SKILL.md for the exact query). Use this instead of --db-url/--org-name/--org-id "
        "when there's no direct DB connection available in this environment."
    ))
    ap.add_argument("--date-min", help="Override period start (YYYY-MM-DD); defaults to earliest CSV date")
    ap.add_argument("--date-max", help="Override period end (YYYY-MM-DD, exclusive); defaults to day after latest CSV date")
    args = ap.parse_args()

    csv_rows = load_csv(args.csv)
    if not csv_rows:
        sys.exit("CSV has no rows")

    if args.masterfees_json:
        db_rows = load_masterfees_json(args.masterfees_json)
        org_id = args.org_id
    else:
        if not args.org_name and not args.org_id:
            sys.exit("Pass --org-name or --org-id (or use --masterfees-json)")

        db_url = args.db_url or os.environ.get("DATABASE_URL") or load_db_url_from_env_file(DEFAULT_ENV_FILE)
        if not db_url:
            sys.exit(f"No database URL found. Pass --db-url, set DATABASE_URL, check {DEFAULT_ENV_FILE}, "
                      f"or fetch the data via the Supabase MCP tool and pass --masterfees-json instead.")

        import psycopg2
        conn = psycopg2.connect(db_url)
        try:
            org_id = args.org_id or fetch_org_id(conn, args.org_name)
            date_min = datetime.strptime(args.date_min, "%Y-%m-%d") if args.date_min else datetime.combine(min(r["date"] for r in csv_rows), datetime.min.time())
            date_max = datetime.strptime(args.date_max, "%Y-%m-%d") if args.date_max else datetime.combine(max(r["date"] for r in csv_rows), datetime.min.time()) + __import__("datetime").timedelta(days=1)
            db_rows = fetch_masterfees_payments(conn, org_id, date_min, date_max)
        finally:
            conn.close()

    mf_rows = load_masterfees_rows(db_rows)

    fee_rows = [r for r in csv_rows if r["type"] == "Income" and r["status"] == "Verified" and r["receipt_number"]]
    for r in fee_rows:
        r["channel"] = channel_of(r["receipt_number"])

    csv_lenco = [r for r in fee_rows if r["channel"] == "LENCO"]
    csv_manual = [r for r in fee_rows if r["channel"] == "MANUAL"]
    mf_lenco = [r for r in mf_rows if r["channel"] == "LENCO"]
    mf_manual = [r for r in mf_rows if r["channel"] == "MANUAL"]

    lenco_ref_results = build_ref_results(by_ref(csv_lenco, "receipt_number"), by_ref(mf_lenco, "external_reference"))
    manual_ref_results = build_ref_results(by_ref(csv_manual, "receipt_number"), by_ref(mf_manual, "external_reference"))

    # Second pass: CSV deposits with no receipt number at all (Lenco 'Cleared'
    # rows) are still real deposits, not "other income" - match them by
    # date+exact-amount against whatever MoneyWise Lenco records the
    # reference-based pass above left unmatched, rather than excluding them
    # from the reconciliation entirely. See categorize_csv_row() / SKILL.md.
    csv_lenco_no_ref = [r for r in csv_rows if r["type"] == "Income" and r["source"] == "Lenco" and not r["receipt_number"]]
    leftover_mf_keys = {(r["ref"], r["mf_dates"]) for r in lenco_ref_results if r["status"] == "MISSING IN LENCO CSV"}
    leftover_mf_items = [m for m in mf_lenco if (m["external_reference"], m["datetime"].isoformat(sep=" ")) in leftover_mf_keys]

    no_ref_pairs, still_unmatched_mf = match_no_reference_rows(csv_lenco_no_ref, leftover_mf_items)
    consumed_mf_keys = {(m["external_reference"], m["datetime"].isoformat(sep=" ")) for m in leftover_mf_items} - \
        {(m["external_reference"], m["datetime"].isoformat(sep=" ")) for m in still_unmatched_mf}
    # Drop the now-matched-by-date+amount MoneyWise records from the plain
    # "missing in CSV" list so they aren't reported twice, then add the
    # second-pass results (both the successful matches and the CSV rows that
    # still have no MoneyWise counterpart at all - a genuine sync gap).
    lenco_ref_results = [r for r in lenco_ref_results if (r["ref"], r["mf_dates"]) not in consumed_mf_keys]
    lenco_ref_results.extend(
        pair_to_result(
            "", c, m,
            display_ref=(m["external_reference"] if m else "(no receipt number in CSV - matched by date+amount)"),
        )
        for c, m in no_ref_pairs
    )

    # Third pass: one payment split across several children/invoices (see
    # base_ref()) - group whatever MoneyWise records are STILL unmatched by
    # (date, base reference) and match a still-unmatched CSV deposit against
    # the group's SUM, not any single sibling.
    csv_status_by_key = {r["csv_key"]: r["status"] for r in lenco_ref_results if r["csv_count"]}
    unresolved_csv_with_receipt = [
        r for r in csv_lenco
        if csv_status_by_key.get((r["datetime"].isoformat(sep=" "), round(r["amount"], 2))) == "MISSING IN MONEYWISE"
    ]
    unresolved_csv_no_ref = [c for c, m in no_ref_pairs if m is None]
    split_csv_candidates = unresolved_csv_with_receipt + unresolved_csv_no_ref

    group_matches, _still_unmatched_csv, _still_unmatched_mf_after_groups = match_split_groups(
        split_csv_candidates, still_unmatched_mf
    )

    if group_matches:
        matched_csv_keys = {(c["datetime"].isoformat(sep=" "), round(c["amount"], 2)) for c, _ in group_matches}
        matched_mf_keys = {(m["datetime"].isoformat(sep=" "), round(m["amount"], 2)) for _, grp in group_matches for m in grp}
        lenco_ref_results = [
            r for r in lenco_ref_results
            if not (r["status"] == "MISSING IN MONEYWISE" and r["csv_key"] in matched_csv_keys)
            and not (r["status"] == "MISSING IN LENCO CSV" and r["mf_key"] in matched_mf_keys)
        ]
        for c, grp in group_matches:
            base = base_ref(grp[0]["external_reference"])
            lenco_ref_results.extend(group_pair_to_results(base, c, grp))

    lenco_daily = build_daily_results(csv_lenco + csv_lenco_no_ref, mf_lenco)
    manual_daily = build_daily_results(csv_manual, mf_manual)

    org_label = args.org_name or org_id or "Organization"
    d_min = min(r["date"] for r in csv_rows)
    d_max = max(r["date"] for r in csv_rows)

    build_workbook(
        org_label, args.out,
        lenco_ref_results, manual_ref_results, lenco_daily, manual_daily,
        csv_rows, mf_lenco, d_min, d_max,
    )

    def summarize(label, results):
        n = len(results)
        m = sum(1 for r in results if r["status"] == "MATCH")
        g = sum(1 for r in results if r["status"] in ("MATCH (GROUPED)", "MATCH (GROUPED, fee-adjusted)"))
        mm = sum(1 for r in results if r["status"] in ("AMOUNT MISMATCH", "AMOUNT MISMATCH (GROUPED)"))
        mw = sum(1 for r in results if r["status"] == "MISSING IN MONEYWISE")
        mc = sum(1 for r in results if r["status"] == "MISSING IN LENCO CSV")
        print(f"{label}: {n} rows | match={m} grouped_match={g} mismatch={mm} missing_in_moneywise={mw} missing_in_csv={mc}")

    summarize("LENCO channel", lenco_ref_results)
    summarize("MANUAL channel", manual_ref_results)
    print(f"LENCO daily gaps: {sum(1 for r in lenco_daily if r['status'] == 'GAP')} / {len(lenco_daily)} days")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()

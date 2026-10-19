/**
 * Ledger Guardian — pure analysis core (no I/O, fully unit-testable).
 *
 * Question it answers for ONE organization: "given Lenco's real transactions and our ledger rows, is every
 * inflow, outflow, sweep and the closing balance exactly right — and if not, what precisely is wrong and what
 * can be repaired safely?"
 *
 * The rules it enforces (each one comes from a real incident, see memory recon-rootcauses-2026-10-19):
 *  R1 every real Lenco transaction is represented by EXACTLY ONE ledger row          (missing / duplicate rows)
 *  R2 the ledger amount equals the money that really moved                           (gross credits, gross debits)
 *  R3 a public sale is booked NET and its commission is swept to the settlement till  (sweeps always happen)
 *     every other credit is booked in FULL (policy since 2026-08-15: direct deposits book what Lenco confirmed)
 *  R4 reference counters are never behind the numbers already issued                  (silent unique violations)
 *  R5 each wallet's stored running balance equals the running sum of its rows        (displayed balance)
 *  R6 ledger total == Lenco ledger balance, once known pending sweeps/holds are accounted for
 */

export const TOLERANCE = 0.005;          // sub-ngwee rounding
export const CLOSING_TOLERANCE = 1.0;    // same tolerance the reconciliation dashboard uses
export const MAX_FEE_RATIO = 0.05;       // a credit/booked gap above 5% (or K150) is never auto-treated as a fee
export const MAX_FEE_ABS = 150;
export const NEW_TXN_GRACE_MS = 15 * 60 * 1000;
/** A missing commission is swept automatically only while the payment is recent; an old one is a decision for a human (the money may already be spent). */
export const SWEEP_MAX_AGE_MS = 14 * 24 * 3600 * 1000;   // let the normal booking path finish before calling a txn "missing"
const LUSAKA_OFFSET_MS = 2 * 3600 * 1000;

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const n = (v: any) => { const x = typeof v === 'number' ? v : parseFloat(v ?? '0'); return Number.isFinite(x) ? x : 0; };
const lower = (s: any) => String(s ?? '').toLowerCase();
const upper = (s: any) => String(s ?? '').toUpperCase();

// ─────────────────────────────── shared predicates (the sync and the dashboard use these too) ──────────────────

/**
 * The MoneyWise commission sweep leg: a debit from a collecting account to the settlement merchant. It is NOT
 * booked in the paying org's ledger (the ledger holds the net subtotal), so the sync must skip it.
 *
 * A forward to ANOTHER MoneyWise org ("To BLUE OPUS- EAGLES NEST / Split-Inflow Payment - …") also carries the
 * words "Split-Inflow" but is a genuine outflow that must be booked — the old substring test skipped it
 * (Blue Opus, K582 on 3–5 Oct 2026).
 */
export function isPlatformSweepDebit(narration: string, reference?: string | null): boolean {
    const d = lower(narration);
    if (upper(reference).startsWith('SPLIT-')) return true;
    if (d.includes('split payment')) return true;
    if (d.includes('to blue opus software')) return true;
    if (d.includes('split-inflow')) {
        const m = /^\s*to\s+(.+?)\s*\/\s*split-inflow/i.exec(String(narration ?? ''));
        return !m || /blue opus software/i.test(m[1]);
    }
    return false;
}

/** CHG- change-return credits are netting against a disbursement, never income (see change-submission notes). */
export const isChangeReturn = (reference?: string | null) => upper(reference).startsWith('CHG-');

/** Public sales are booked NET of the platform commission; everything else is booked in full. */
export function isPublicSaleRow(row: { description?: string | null; external_reference?: string | null }): boolean {
    const d = String(row.description ?? '');
    const ref = upper(row.external_reference);
    return d.startsWith('Sale:') || d.startsWith('Revenue:') || ref.endsWith('-PUB') || ref.endsWith('-POS');
}

export const sweepReferenceFor = (originalReference: string) => `SPLIT-${originalReference}`;

// ───────────────────────────────────────────────── types ─────────────────────────────────────────────────────

export interface RawLencoTxn { id: string; type: string; amount: number | string; datetime: string; narration?: string; balance: number | string; }
export interface LencoTxn {
    id: string; type: 'credit' | 'debit'; amount: number; datetime: string; day: string; narration: string; balance: number;
    /** Cash that really moved: debits = amount + bank fee (from the running balance); credits = amount. */
    gross: number; signed: number; grossUncertain: boolean;
    /** Merchant reference when known (settlement map / transfers). */
    ref: string | null;
    isSweep: boolean; isChange: boolean;
}
export interface LedgerRow {
    id: string; wallet_id: string | null; date: string; created_at: string; debit: number | string | null; credit: number | string | null;
    balance_after?: number | string | null; status: string; entry_type: string; description?: string | null;
    external_reference?: string | null; reference_number?: string | null; requisition_id?: string | null;
}
export interface CounterRow { entity_type: string; year: number; last_value: number; }

export type IssueCode =
    | 'MISSING_IN_LEDGER' | 'DUPLICATE_ROWS' | 'SWEEP_MISSING' | 'FEE_RETAINED_GAP' | 'AMOUNT_MISMATCH' | 'OVERBOOKED'
    | 'FAILED_PAYOUT_BOOKED' | 'SWEEP_NOT_IN_LEDGER' | 'LEDGER_ONLY_ROW' | 'COUNTER_BEHIND' | 'BALANCE_CHAIN_BROKEN' | 'FUNDS_ON_HOLD' | 'CLOSING_UNEXPLAINED';

export interface Issue {
    code: IssueCode;
    severity: 'critical' | 'warning' | 'info';
    /** Can this be repaired without a human decision? (the executor still checks the global mode) */
    safe: boolean;
    message: string;
    txnId?: string; entryIds?: string[]; keepId?: string; walletId?: string;
    amount?: number;                 // the money involved (gap, duplicate amount, …)
    entity?: { type: string; year: number; to: number };
}

export interface AnalyzeInput {
    ledger: LedgerRow[];             // MONEYWISE_WALLET rows of the org (all statuses)
    txns: RawLencoTxn[];             // Lenco feed (any order); must cover [windowStart, now]
    balance: { available: number; ledger: number };
    /** txn id → merchant reference (collections settlement map + transfers), used to pair DEP-/REF- ledger rows. */
    refByTxnId?: Map<string, string>;
    /** txn id → the fee Lenco reports for that EXTERNAL payout (never for on-us transfers, which are free). */
    feeByTxnId?: Map<string, number>;
    /** requisition id → payout references (REQ-…, MWPAY-…), to pair requisition disbursements with the Lenco debit. */
    payoutRefsByRequisition?: Map<string, string[]>;
    /** references of payouts Lenco reports as FAILED. */
    failedPayoutRefs?: Set<string>;
    counters?: CounterRow[];
    /** True for the MoneyWise settlement org itself (Blue Opus): it keeps its own commission, so no sweep is ever owed. */
    isSettlementOrg?: boolean;
    /** Lenco transactions strictly before this day are covered by an opening balance / frozen history. */
    cutoffDate?: string | null;
    /** Only judge Lenco transactions on/after this day (the incremental window). null = everything. */
    windowStart?: string | null;
    /** True when `txns` is known to hold the org's COMPLETE history (full pass) — the closing check is only exact then. */
    complete: boolean;
    now?: number;
}

export interface Analysis {
    issues: Issue[];
    stats: { lencoTxns: number; judged: number; matched: number; ledgerRows: number };
    closing: { ledgerSum: number; lencoLedger: number; lencoAvailable: number; hold: number; diff: number; explained: number; unexplained: number };
    /** Each row-level issue's effect on (ledger total − Lenco ledger balance), by day — lets a later incremental run verify the closing balance against a full-pass baseline. */
    effects: Effect[];
    status: 'OK' | 'HEALABLE' | 'ATTENTION';
}
export interface Effect { day: string; effect: number; kind: string; }

// ─────────────────────────────────────────────── enrichment ──────────────────────────────────────────────────

export const lusakaDay = (iso: string) => new Date(new Date(iso).getTime() + LUSAKA_OFFSET_MS).toISOString().slice(0, 10);
export const rowAmount = (r: Pick<LedgerRow, 'debit' | 'credit'>) => r2(n(r.debit) - n(r.credit));

/** Oldest-first; debits get their true gross from the running balance (a batch settles out of timestamp order, so the delta is only trusted when it looks like "amount + a bank fee"). */
/** The published Zambia payout tariff (mirrors LencoService.calculatePayoutFee) — the sync's own fallback when a batch scrambles the running balance. */
export function payoutTariffFee(amount: number): number {
    if (amount <= 150) return 8.5; if (amount <= 300) return 10; if (amount <= 501) return 11; if (amount <= 1000) return 12;
    if (amount <= 3000) return 15; if (amount <= 5000) return 18; return 20;
}

export function enrichTxns(raw: RawLencoTxn[], refByTxnId?: Map<string, string>, feeByTxnId?: Map<string, number>): LencoTxn[] {
    const sorted = [...raw].sort((a, b) => (a.datetime < b.datetime ? -1 : a.datetime > b.datetime ? 1 : 0));
    return sorted.map((t, i) => {
        const type = lower(t.type) === 'debit' ? 'debit' : 'credit';
        const amount = r2(n(t.amount));
        const narration = String(t.narration ?? '');
        const refForGross = refByTxnId?.get(t.id) ?? null;
        // Platform sweeps and on-us transfers cost nothing (Lenco reports a fee but never takes it), so their gross IS the amount.
        const freeTransfer = type === 'debit' && (isPlatformSweepDebit(narration, refForGross) || /^(MWPAY-|SVT-|INVW-|PG-SUB-|SPLIT-)/i.test(refForGross ?? ''));
        let gross = amount, uncertain = false;
        if (type === 'debit' && !freeTransfer) {
            const prev = i > 0 ? n(sorted[i - 1].balance) : null;
            if (prev !== null) {
                const delta = r2(prev - n(t.balance));
                const fee = r2(delta - amount);
                if (fee >= -0.02 && fee <= Math.max(60, amount * 0.03)) gross = Math.max(delta, amount); else uncertain = true;
            } else uncertain = true;
            // A batch of same-second payouts settles out of timestamp order, so the running-balance delta is meaningless for them. Use the
            // transfer's own reported fee (reliable for external payouts), else the published tariff — what the sync books in that case.
            if (uncertain) gross = r2(amount + (feeByTxnId?.get(t.id) ?? payoutTariffFee(amount)));
        }
        const ref = refByTxnId?.get(t.id) ?? null;
        return {
            id: t.id, type, amount, datetime: t.datetime, day: lusakaDay(t.datetime), narration, balance: n(t.balance),
            gross, signed: type === 'credit' ? amount : -gross, grossUncertain: uncertain, ref,
            isSweep: type === 'debit' && isPlatformSweepDebit(narration, ref),
            isChange: type === 'credit' && isChangeReturn(ref),
        };
    });
}

// ───────────────────────────────────────────── matching (R1) ─────────────────────────────────────────────────

interface Pairing { rowsByTxn: Map<string, LedgerRow[]>; matched: Set<string>; how: Map<string, string>; adjuncts: Map<string, LedgerRow[]> }

/**
 * Pairs ledger rows with Lenco transactions. Passes run from most to least certain; a row is paired once.
 *  1 external_reference == Lenco txn id   2 a ledger reference == the txn's merchant/payout reference
 *  3 requisition's payout reference       4 same amount, same day   5 same amount, ≤3 days   6 booked net of fee, ±1 day
 */
export function pairRows(rows: LedgerRow[], txns: LencoTxn[], payoutRefsByRequisition?: Map<string, string[]>): Pairing {
    const byId = new Map(txns.map(t => [t.id, t]));
    const byRef = new Map<string, LencoTxn[]>();
    for (const t of txns) if (t.ref) { const k = lower(t.ref); (byRef.get(k) ?? byRef.set(k, []).get(k)!).push(t); }
    const rowsByTxn = new Map<string, LedgerRow[]>(); const matched = new Set<string>(); const how = new Map<string, string>();
    const adjuncts = new Map<string, LedgerRow[]>();   // FEERET-<txnId> rows: the retained fee of a credit, part of THAT transaction's booking
    const link = (row: LedgerRow, t: LencoTxn, why: string) => {
        (rowsByTxn.get(t.id) ?? rowsByTxn.set(t.id, []).get(t.id)!).push(row); matched.add(row.id); how.set(row.id, why);
    };
    const allRows = [...rows].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    for (const r of allRows) {
        const m = /^FEERET-(.+)$/.exec(String(r.external_reference ?? '').trim());
        if (m && byId.has(m[1])) { (adjuncts.get(m[1]) ?? adjuncts.set(m[1], []).get(m[1])!).push(r); matched.add(r.id); how.set(r.id, 'adjunct'); }
    }
    const cand = allRows.filter(r => !matched.has(r.id));
    for (const r of cand) { const t = byId.get(String(r.external_reference ?? '').trim()); if (t) link(r, t, 'id'); }
    for (const r of cand) {
        if (matched.has(r.id)) continue;
        for (const k of [r.external_reference, r.reference_number]) {
            const key = lower(String(k ?? '').trim());
            const list = key ? byRef.get(key) : undefined;
            if (list?.length) { link(r, list.find(t => !rowsByTxn.has(t.id)) ?? list[0], 'ref'); break; }
        }
    }
    for (const r of cand) {
        if (matched.has(r.id) || !r.requisition_id) continue;
        for (const pref of payoutRefsByRequisition?.get(r.requisition_id) ?? []) {
            const t = byRef.get(lower(pref))?.find(x => !rowsByTxn.has(x.id));
            if (t) { link(r, t, 'requisition'); break; }
        }
    }
    const free = (t: LencoTxn) => !rowsByTxn.has(t.id) && !t.isSweep && !t.isChange;
    for (const [tolDays, why] of [[0, 'amount+day'], [3, 'amount+3d']] as const) {
        for (const r of cand) {
            if (matched.has(r.id)) continue;
            const a = rowAmount(r); if (Math.abs(a) < TOLERANCE) continue;
            let best: { d: number; t: LencoTxn } | null = null;
            for (const t of txns) {
                if (!free(t) || (a > 0) !== (t.type === 'credit')) continue;
                if (!(Math.abs(Math.abs(a) - t.amount) < 0.006 || Math.abs(Math.abs(a) - t.gross) < 0.006)) continue;
                const d = Math.abs(Date.parse(t.day) - Date.parse(String(r.date).slice(0, 10))) / 86400000;
                if (d <= tolDays && (!best || d < best.d)) best = { d, t };
            }
            if (best) link(r, best.t, why);
        }
    }
    for (const r of cand) {                                    // a credit booked a little LOW (net of the fee the customer paid)
        if (matched.has(r.id)) continue;
        const a = rowAmount(r); if (a <= 0) continue;
        let best: { k: number; t: LencoTxn } | null = null;
        for (const t of txns) {
            if (!free(t) || t.type !== 'credit') continue;
            const gap = r2(t.amount - a);
            if (gap <= TOLERANCE || gap > Math.max(1, t.amount * 0.035)) continue;
            const d = Math.abs(Date.parse(t.day) - Date.parse(String(r.date).slice(0, 10))) / 86400000;
            if (d <= 1 && (!best || gap + d < best.k)) best = { k: gap + d, t };
        }
        if (best) link(r, best.t, 'net-of-fee');
    }
    // On-us transfers (MoneyWise Pay, savings, investments, subscriptions) cost the sender nothing, so a row carrying one of
    // their references that differs by a small amount from a same-day debit is that debit booked WRONG (e.g. a phantom fee),
    // not a different transaction. Pair it so the error is reported as an amount mismatch instead of "missing + orphan".
    for (const r of cand) {
        if (matched.has(r.id) || !/^(MWPAY-|SVT-|INVW-|PG-SUB-)/i.test(String(r.external_reference ?? ''))) continue;
        const a = rowAmount(r); if (a >= 0) continue;
        let best: { k: number; t: LencoTxn } | null = null;
        for (const t of txns) {
            if (!free(t) || t.type !== 'debit') continue;
            const dAmt = Math.abs(Math.abs(a) - t.gross);
            const d = Math.abs(Date.parse(t.day) - Date.parse(String(r.date).slice(0, 10))) / 86400000;
            if (dAmt <= 60 && d <= 1 && (!best || dAmt < best.k)) best = { k: dAmt, t };
        }
        if (best) link(r, best.t, 'onus-near');
    }
    return { rowsByTxn, matched, how, adjuncts };
}

// ───────────────────────────────────────────── the analysis ──────────────────────────────────────────────────

const livenessFilter = (r: LedgerRow) => upper(r.status) !== 'PENDING';

/** Which of several rows for one Lenco txn is the "real" one: requisition-linked / descriptive / merchant-referenced beats a raw bank-narration row; then the oldest. */
export function chooseKeeper(rows: LedgerRow[]): LedgerRow {
    const score = (r: LedgerRow) => {
        const d = String(r.description ?? ''); const ref = String(r.external_reference ?? '');
        const meaningful = r.requisition_id || /^(Sale:|Revenue:|Voucher|MONEYWISE|Master Fees|MoneyWise)/.test(d) || /^(DEP-|MAN-|REF-|MWPAY-|REQ-)/.test(ref);
        return meaningful ? 0 : 1;
    };
    return [...rows].sort((a, b) => score(a) - score(b) || (a.created_at < b.created_at ? -1 : 1))[0];
}

export function analyze(input: AnalyzeInput): Analysis {
    const now = input.now ?? Date.now();
    const issues: Issue[] = [];
    const all = enrichTxns(input.txns, input.refByTxnId, input.feeByTxnId);
    const live = input.ledger.filter(livenessFilter);
    // History before the opening balance is already inside it; the sync ignores it too (the later of opening date / forward cutoff wins).
    const openingDate = live.filter(r => upper(r.entry_type) === 'OPENING_BALANCE').map(r => String(r.date).slice(0, 10)).sort()[0] ?? null;
    const cutoff = [input.cutoffDate, openingDate].filter(Boolean).sort().pop() as string | undefined ?? null;
    // A "REV-DUP-<rowId>" row reverses the duplicate row it names (an earlier manual repair): the pair nets to zero, treat it as already neutralised.
    const liveById = new Map(live.map(r => [r.id.toLowerCase(), r]));
    const neutralised = new Set<string>();
    for (const r of live) {
        const m = /^REV-DUP-([0-9a-f-]{36})/i.exec(String(r.external_reference ?? ''));
        if (m && liveById.has(m[1].toLowerCase())) { neutralised.add(r.id.toLowerCase()); neutralised.add(m[1].toLowerCase()); }
    }
    const considered = live.filter(r => Math.abs(rowAmount(r)) >= TOLERANCE && upper(r.entry_type) !== 'OPENING_BALANCE' && !neutralised.has(r.id.toLowerCase()));
    const pairing = pairRows(considered, all, input.payoutRefsByRequisition);

    const inScope = (t: LencoTxn) =>
        (!cutoff || t.day >= cutoff) && (!input.windowStart || t.day >= input.windowStart);
    const judged = all.filter(t => inScope(t) && !t.isSweep && !t.isChange);

    // Lenco's own platform-sweep debits, available to be matched to the commission gap of a credit.
    //  1. EXACT: the sweep transfer's reference is "SPLIT-<the credit's merchant reference>" (known from /transfers and /collections).
    //  2. otherwise the nearest unreferenced sweep in time with a similar amount — the sweeper computes the commission from the intent
    //     amount, so it can differ from (credit − booked) by a few ngwee. Sweeps that carry a reference never take part in (2): they
    //     belong to some other credit, and stealing them cascades one missing sweep into many false alarms.
    const sweeps = all.filter(t => t.isSweep).map(t => ({ t, used: false }));
    const sweepByRef = new Map<string, (typeof sweeps)[number]>();
    for (const x of sweeps) if (x.t.ref && /^SPLIT-/i.test(x.t.ref)) sweepByRef.set(lower(x.t.ref), x);
    // A sweep that already has its own ledger row (older syncs booked them as outflows) is booked: its cash effect is exactly 0.
    const sweepBooked = (t: LencoTxn) => (pairing.rowsByTxn.get(t.id) ?? []).reduce((a, r) => a + rowAmount(r), 0);
    const sweepEffect = (t: LencoTxn) => r2(t.gross + sweepBooked(t));
    const findSweep = (credit: LencoTxn, gap: number) => {
        if (credit.ref) {
            const x = sweepByRef.get(`split-${lower(credit.ref)}`);
            if (x && !x.used && Math.abs(x.t.amount - gap) <= Math.max(0.5, gap * 0.1)) { x.used = true; return x; }
        }
        const tol = Math.max(0.06, gap * 0.02);
        const c0 = Date.parse(credit.datetime);
        let best: { x: (typeof sweeps)[number]; k: number } | null = null;
        for (const x of sweeps) {
            if (x.used || x.t.ref || Math.abs(x.t.amount - gap) > tol) continue;
            const dt = Date.parse(x.t.datetime) - c0;
            if (dt < -120000 || dt > 48 * 3600 * 1000) continue;
            const k = Math.abs(dt) / 3600000 + Math.abs(x.t.amount - gap) * 10;
            if (!best || k < best.k) best = { x, k };
        }
        if (best) best.x.used = true;
        return best?.x;
    };

    const effects: Effect[] = [];   // effect each issue has on (ledgerSum − lencoLedger), by day
    // A windowed run only vouches for its window; older effects live in the full-pass baseline.
    const add = (day: string, v: number, kind = 'other') => { if (Math.abs(v) > 0 && !(input.windowStart && day < input.windowStart)) effects.push({ day, effect: r2(v), kind }); };
    for (const t of judged) {
        const rows = pairing.rowsByTxn.get(t.id) ?? [];
        const aged = now - Date.parse(t.datetime) > NEW_TXN_GRACE_MS;
        if (rows.length === 0) {
            if (!aged) { add(t.day, -t.signed, 'young'); continue; }          // still inside the booking grace period: not an issue, but the gap is real
            issues.push({ code: 'MISSING_IN_LEDGER', severity: 'critical', safe: true, txnId: t.id, amount: t.signed,
                message: `Lenco ${t.type} of K${t.type === 'credit' ? t.amount : t.gross} on ${t.day} ("${t.narration.slice(0, 50)}") has no ledger row.` });
            add(t.day, -t.signed, 'missing');                        // ledger is short by the txn's cash effect
            continue;
        }
        let row = rows[0];
        if (rows.length > 1) {
            const keep = chooseKeeper(rows);
            const extras = rows.filter(r => r.id !== keep.id).filter(r =>
                Math.abs(Math.abs(rowAmount(r)) - Math.abs(t.signed)) <= Math.max(1, Math.abs(t.signed) * 0.035) && Math.sign(rowAmount(r)) === Math.sign(t.signed));
            if (extras.length) {
                const extraSum = extraSumOf(extras);
                issues.push({ code: 'DUPLICATE_ROWS', severity: 'critical', safe: true, txnId: t.id, keepId: keep.id, entryIds: extras.map(r => r.id), amount: extraSum,
                    message: `Lenco txn ${t.id.slice(0, 8)} (K${Math.abs(t.signed)}, ${t.day}) is booked ${rows.length} times; ${extras.length} extra row(s) total K${extraSum}.` });
                add(t.day, extraSum, 'duplicate');
            }
            const rest = rows.filter(r => !extras.some(e => e.id === r.id));
            if (rest.length > 1) {                                   // several rows that are not copies of each other (a split) — a human decides
                const total = extraSumOf(rest);
                if (Math.abs(total - t.signed) > TOLERANCE) {
                    issues.push({ code: 'AMOUNT_MISMATCH', severity: 'warning', safe: false, txnId: t.id, entryIds: rest.map(r => r.id), amount: r2(total - t.signed),
                        message: `Lenco txn ${t.id.slice(0, 8)} is split over ${rest.length} rows totalling K${total} vs K${Math.abs(t.signed)}.` });
                    add(t.day, total - t.signed, 'split');
                }
                continue;
            }
            row = rest[0] ?? keep;
        }
        const booked = r2(rowAmount(row) + (pairing.adjuncts.get(t.id) ?? []).reduce((a, r) => a + rowAmount(r), 0)); const diff = r2(booked - t.signed);
        if (Math.abs(diff) <= TOLERANCE) continue;
        if (t.type === 'credit' && diff < 0) {
            const gap = r2(-diff);
            const feeLike = gap <= Math.min(t.amount * MAX_FEE_RATIO, MAX_FEE_ABS);
            const sweep = feeLike ? findSweep(t, gap) : undefined;
            if (sweep) {                                              // booked net and the commission was swept: exactly right (any row type)
                add(t.day, -gap, 'net+swept'); add(sweep.t.day, sweepEffect(sweep.t), 'net+swept');    // …recorded explicitly so a few ngwee of rounding between them still balance
                continue;
            }
            if (isPublicSaleRow(row) && feeLike && !input.isSettlementOrg) {
                issues.push({ code: 'SWEEP_MISSING', severity: 'warning', safe: now - Date.parse(t.datetime) <= SWEEP_MAX_AGE_MS, txnId: t.id, entryIds: [row.id], amount: gap,
                    message: `Public sale ${row.external_reference ?? t.id.slice(0, 8)} booked net K${booked} of K${t.amount}; the K${gap} commission was never swept.` });
                add(t.day, -gap, 'sweepMissing');                     // the money is still in the account (Lenco higher) until swept
            } else if (feeLike) {
                issues.push({ code: 'FEE_RETAINED_GAP', severity: 'warning', safe: true, txnId: t.id, entryIds: [row.id], amount: gap,
                    message: `Credit K${t.amount} was booked as K${booked}; the K${gap} surplus stayed in the account and is not in the ledger.` });
                add(t.day, -gap, 'feeGap');
            } else {
                issues.push({ code: 'AMOUNT_MISMATCH', severity: 'warning', safe: false, txnId: t.id, entryIds: [row.id], amount: diff,
                    message: `Credit K${t.amount} booked as K${booked} (gap K${gap} is too large to be a fee).` });
                add(t.day, diff, 'bigGap');
            }
        } else if (t.type === 'credit' && diff > 0) {
            issues.push({ code: 'OVERBOOKED', severity: 'warning', safe: false, txnId: t.id, entryIds: [row.id], amount: diff,
                message: `Credit K${t.amount} is booked as K${booked} — K${diff} more than Lenco received.` });
            add(t.day, diff, 'overbooked');
        } else {
            // Requisition-linked rows legitimately differ (voucher actual vs gross, change netting) → info only — EXCEPT on-us
            // transfers (MoneyWise Pay, savings, investments, subscriptions): Lenco charges the sender nothing, so any
            // difference there is a booking error (the K30,005-vs-K30,000 incident), never a legitimate netting.
            const onUs = /^(MWPAY-|SVT-|INVW-|PG-SUB-)/i.test(String(row.external_reference ?? ''));
            issues.push({ code: 'AMOUNT_MISMATCH', severity: row.requisition_id && !onUs ? 'info' : 'warning', safe: false, txnId: t.id, entryIds: [row.id], amount: diff,
                message: `Debit K${t.gross} (${t.day}) is booked as K${Math.abs(booked)} — differs by K${Math.abs(diff)}.` });
            add(t.day, diff, 'debitDiff');
        }
    }

    // A commission was swept out of Lenco for a credit the ledger holds in FULL (e.g. MasterFees payments): the ledger is higher than Lenco
    // by exactly that amount until the commission is recorded. The established policy (reconciliation.service healMissingPlatformFees,
    // approved after Twalumbu's K868.11 on 2026-08-15) is to post the unabsorbed sweep as an EXPENSE keyed by the Lenco id — so safe.
    for (const x of sweeps) {
        if (x.used) continue;
        if (sweepBooked(x.t) !== 0) { add(x.t.day, sweepEffect(x.t), 'sweepBooked'); continue; }      // already recorded as an outflow: nothing to do
        if (!inScope(x.t)) { add(x.t.day, x.t.gross, 'sweepOutOfScope'); continue; }                  // older than the cut-off / window: accounted for, not judged
        issues.push({ code: 'SWEEP_NOT_IN_LEDGER', severity: 'warning', safe: x.t.gross <= MAX_FEE_ABS, txnId: x.t.id, amount: x.t.gross,
            message: `A K${x.t.gross} platform commission left the account on ${x.t.day} for a payment the ledger holds in full — the ledger is K${x.t.gross} above Lenco for it.` });
        add(x.t.day, x.t.gross, 'sweepUnbooked');
    }

    const flaggedRows = new Set<string>();
    // failed payouts still booked as money out
    if (input.failedPayoutRefs?.size) {
        for (const r of considered) {
            if (pairing.matched.has(r.id) || upper(r.entry_type) !== 'DISBURSEMENT' || !r.requisition_id) continue;
            const refs = input.payoutRefsByRequisition?.get(r.requisition_id) ?? [];
            if (refs.length && refs.every(x => input.failedPayoutRefs!.has(x))) {
                issues.push({ code: 'FAILED_PAYOUT_BOOKED', severity: 'critical', safe: false, entryIds: [r.id], amount: rowAmount(r),
                    message: `Requisition ${r.requisition_id.slice(0, 8)} is booked as paid (K${Math.abs(rowAmount(r))}) but Lenco reports the payout FAILED.` });
                flaggedRows.add(r.id);
            }
        }
    }

    // ── Complete the balance identity ────────────────────────────────────────────────────────────────────────────────────────────────
    //   ledger total − Lenco balance  =  Σ over judged txns (booked − real)         (the issues above)
    //                                  + Σ over Lenco txns that are not judged        (change-return credits, history before the opening balance)
    //                                  + Σ over ledger rows with no Lenco counterpart (opening balance, contra / manual entries, wallet transfers)
    // so every ngwee of any gap is attributed to something, and CLOSING_UNEXPLAINED can only mean a genuine hole.
    const judgedIds = new Set(judged.map(t => t.id));
    for (const t of all) {
        if (judgedIds.has(t.id) || t.isSweep) continue;
        const booked = [...(pairing.rowsByTxn.get(t.id) ?? []), ...(pairing.adjuncts.get(t.id) ?? [])].reduce((a, r) => a + rowAmount(r), 0);
        add(t.day, booked - t.signed, t.isChange ? 'chgReturn' : 'nonJudged');
    }
    const STRUCTURAL = /^(\[RECON|\[Reconciled|Reversal|Transfer:|Historical import|Opening balance|Contra:|Commission income|Loss on|Savings contribution|Investment:|Withdrawal$)/i;
    const structural = (r: LedgerRow) => ['OPENING_BALANCE', 'CLOSING_BALANCE', 'ADJUSTMENT'].includes(upper(r.entry_type)) ||
        /^(RECON-|CONTRA-|FEE-|INVEST-|REV-|CASHXFER|FEERET-)/i.test(String(r.external_reference ?? '')) || STRUCTURAL.test(String(r.description ?? ''));
    for (const r of live) {
        if (pairing.matched.has(r.id) || neutralised.has(r.id.toLowerCase())) continue;
        const a = rowAmount(r);
        if (Math.abs(a) < TOLERANCE) continue;
        add(String(r.date).slice(0, 10), a, structural(r) ? 'structuralRow' : 'ledgerOnly');
        if (!structural(r) && !flaggedRows.has(r.id) && (!cutoff || String(r.date).slice(0, 10) >= cutoff)) {
            issues.push({ code: 'LEDGER_ONLY_ROW', severity: 'warning', safe: false, entryIds: [r.id], amount: a,
                message: `Ledger row "${String(r.description ?? '').slice(0, 50)}" (K${a}, ${String(r.date).slice(0, 10)}) has no matching Lenco transaction in this account.` });
        }
    }

    // R4 counters — the generator issues counter+1, counter+2, … ; it collides as soon as one of those numbers already exists.
    const usedNums = new Map<string, number[]>();       // "ENTITY|year" → numbers in use (CR- and REC- share the INFLOW counter)
    for (const r of input.ledger) {
        const m = /^([A-Z]+)-(\d{4})-(\d+)$/.exec(String(r.reference_number ?? ''));
        if (!m) continue;
        const entity = m[1] === 'CR' || m[1] === 'REC' ? 'INFLOW' : m[1] === 'RT' ? 'RETURN' : m[1] === 'ADJ' ? 'ADJUSTMENT' : null;
        if (!entity) continue;
        const k = `${entity}|${m[2]}`; (usedNums.get(k) ?? usedNums.set(k, []).get(k)!).push(parseInt(m[3], 10));
    }
    for (const c of input.counters ?? []) {
        const nums = usedNums.get(`${c.entity_type}|${c.year}`) ?? [];
        const ahead = nums.filter(x => x > c.last_value);
        if (ahead.length && Math.min(...ahead) - c.last_value <= 25) {
            const to = Math.max(...nums);
            issues.push({ code: 'COUNTER_BEHIND', severity: 'critical', safe: true, entity: { type: c.entity_type, year: c.year, to },
                message: `${c.entity_type} ${c.year} reference counter is ${c.last_value} but number ${Math.min(...ahead)} (and up to ${to}) is already used — new ${c.entity_type} entries will be rejected as duplicate references.` });
        }
    }

    // R5 stored running balances
    const byWallet = new Map<string, LedgerRow[]>();
    for (const r of live) (byWallet.get(r.wallet_id ?? 'none') ?? byWallet.set(r.wallet_id ?? 'none', []).get(r.wallet_id ?? 'none')!).push(r);
    for (const [w, rs] of byWallet) {
        rs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1));
        let run = 0, bad = 0;
        for (const r of rs) { run = r2(run + rowAmount(r)); if (Math.abs(run - n(r.balance_after)) > TOLERANCE) bad++; }
        if (bad) issues.push({ code: 'BALANCE_CHAIN_BROKEN', severity: 'warning', safe: true, walletId: w === 'none' ? undefined : w, amount: bad,
            message: `${bad} row(s) in wallet ${w.slice(0, 8)} have a stored running balance that does not equal the running sum.` });
    }

    // R6 closing balance
    const explained = r2(effects.reduce((a, e) => a + e.effect, 0));
    const ledgerSum = r2(live.reduce((s, r) => s + rowAmount(r), 0));
    const hold = r2(input.balance.ledger - input.balance.available);
    const diff = r2(ledgerSum - input.balance.ledger);
    if (hold > TOLERANCE) issues.push({ code: 'FUNDS_ON_HOLD', severity: 'info', safe: false, amount: hold,
        message: `Lenco is holding K${hold} (available K${input.balance.available} vs ledger K${input.balance.ledger}) — typically failed payouts not yet released.` });
    const unexplained = r2(diff - explained);
    // The closing check is exact only against the complete history; a windowed run can only vouch for what it examined.
    if (input.complete && Math.abs(unexplained) > CLOSING_TOLERANCE) {
        issues.push({ code: 'CLOSING_UNEXPLAINED', severity: 'critical', safe: false, amount: unexplained,
            message: `Ledger total K${ledgerSum} vs Lenco K${input.balance.ledger}: K${diff} apart, of which K${unexplained} is not explained by any row-level issue.` });
    }

    const actionable = issues.filter(i => i.severity !== 'info');
    const status: Analysis['status'] = actionable.length === 0 ? 'OK' : actionable.every(i => i.safe) ? 'HEALABLE' : 'ATTENTION';
    return {
        issues,
        stats: { lencoTxns: all.length, judged: judged.length, matched: pairing.matched.size, ledgerRows: live.length },
        closing: { ledgerSum, lencoLedger: input.balance.ledger, lencoAvailable: input.balance.available, hold, diff, explained, unexplained },
        effects,
        status,
    };
}

const extraSumOf = (rows: LedgerRow[]) => r2(rows.reduce((s, r) => s + rowAmount(r), 0));

/**
 * Ledger Guardian core — scenario matrix. Pure (no DB, no network):  npx ts-node --transpile-only src/scripts/test_ledger_guardian_core.ts
 * One scenario per real incident, plus clean cases that must stay silent (a false positive here would mean an auto-healer
 * touching correct data).
 */
import { analyze, isPlatformSweepDebit, LedgerRow, RawLencoTxn, AnalyzeInput, IssueCode } from '../services/ledgerGuardian/core';

let pass = 0, fail = 0;
const ok = (name: string, cond: any, detail = '') => { if (cond) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${detail}`); } };

const NOW = Date.parse('2026-10-20T12:00:00Z');
let seq = 0;
const iso = (d: string) => `${d}T08:00:00.000Z`;
const txn = (o: Partial<RawLencoTxn> & { amount: number; type: 'credit' | 'debit'; balance: number }): RawLencoTxn =>
    ({ id: `txn-${++seq}-0000-0000-0000-000000000000`, datetime: iso('2026-10-10'), narration: 'CUSTOMER PAYER', ...o } as RawLencoTxn);
const row = (o: Partial<LedgerRow> & { debit?: number; credit?: number }): LedgerRow =>
    ({ id: `row-${++seq}`, wallet_id: 'w1', date: '2026-10-10', created_at: '2026-10-10T08:01:00Z', debit: 0, credit: 0, balance_after: 0, status: 'COMPLETED', entry_type: 'INFLOW', description: 'x', external_reference: null, reference_number: null, requisition_id: null, ...o } as LedgerRow);
/** build running balance_after so the chain is intact unless a test breaks it on purpose */
const chain = (rows: LedgerRow[]) => { let run = 0; for (const r of [...rows].sort((a, b) => (a.date + a.created_at < b.date + b.created_at ? -1 : 1))) { run = Math.round((run + Number(r.debit) - Number(r.credit)) * 100) / 100; r.balance_after = run; } return rows; };
const base = (o: Partial<AnalyzeInput>): AnalyzeInput => ({ ledger: [], txns: [], balance: { available: 0, ledger: 0 }, complete: true, now: NOW, ...o });
const codes = (a: ReturnType<typeof analyze>) => a.issues.filter(i => i.severity !== 'info').map(i => i.code).sort();
const has = (a: ReturnType<typeof analyze>, c: IssueCode) => a.issues.some(i => i.code === c);

// ── S1: a perfectly clean org is silent
{
    const c1 = txn({ type: 'credit', amount: 500, balance: 500, datetime: iso('2026-10-10') });
    const d1 = txn({ type: 'debit', amount: 100, balance: 391.5, datetime: iso('2026-10-11') });   // 100 + K8.50 bank fee
    const rows = chain([row({ debit: 500, external_reference: c1.id, date: '2026-10-10' }), row({ credit: 108.5, external_reference: d1.id, entry_type: 'EXPENSE', date: '2026-10-11', created_at: '2026-10-11T08:01:00Z' })]);
    const a = analyze(base({ ledger: rows, txns: [c1, d1], balance: { available: 391.5, ledger: 391.5 } }));
    ok('S1 clean org → status OK, zero issues', a.status === 'OK' && a.issues.length === 0, JSON.stringify(a.issues));
}
// ── S2 missing rows: aged → flagged (safe); brand-new → given grace
{
    const c1 = txn({ type: 'credit', amount: 482.13, balance: 482.13, datetime: iso('2026-10-06') });
    const a = analyze(base({ ledger: [], txns: [c1], balance: { available: 482.13, ledger: 482.13 } }));
    ok('S2a aged Lenco credit with no ledger row → MISSING_IN_LEDGER (safe, critical)', has(a, 'MISSING_IN_LEDGER') && a.issues[0].safe && a.issues[0].severity === 'critical');
    ok('S2b …and the closing diff is fully explained by it (no CLOSING_UNEXPLAINED)', !has(a, 'CLOSING_UNEXPLAINED'), JSON.stringify(a.closing));
    const young = txn({ type: 'credit', amount: 10, balance: 10, datetime: new Date(NOW - 5 * 60000).toISOString() });
    const b = analyze(base({ ledger: [], txns: [young], balance: { available: 10, ledger: 10 } }));
    ok('S2c a 5-minute-old credit is NOT called missing (normal booking path still running)', !has(b, 'MISSING_IN_LEDGER'));
}
// ── S3: duplicates — identical Lenco id on two rows (18 Sep cutover) → keep the requisition-linked one
{
    const d1 = txn({ type: 'debit', amount: 490, balance: 500.5, datetime: iso('2026-10-07') });    // gross 499.5
    d1.id = 'f551db59-e4c6-4b23-b65b-b134c5bb0e33';
    const orig = row({ credit: 499.5, entry_type: 'DISBURSEMENT', requisition_id: 'req1', external_reference: d1.id, description: 'MONEYWISE_WALLET disbursed for Requisition #92a99532', date: '2026-10-07' });
    const dup = row({ credit: 499.5, entry_type: 'EXPENSE', external_reference: d1.id, description: 'Disbursement for Requisition #92a99532 / 262500244', date: '2026-10-07', created_at: '2026-10-07T09:00:00Z' });
    const open = txn({ type: 'credit', amount: 1000, balance: 1000, datetime: iso('2026-10-01') });
    const rows = chain([row({ debit: 1000, external_reference: open.id, date: '2026-10-01' }), orig, dup]);
    const a = analyze(base({ ledger: rows, txns: [open, d1], balance: { available: 500.5, ledger: 500.5 } }));
    const dupIssue = a.issues.find(i => i.code === 'DUPLICATE_ROWS');
    ok('S3 duplicate disbursement rows → DUPLICATE_ROWS keeps the requisition-linked row, extra = raw EXPENSE', !!dupIssue && dupIssue.keepId === orig.id && dupIssue.entryIds!.length === 1 && dupIssue.entryIds![0] === dup.id && dupIssue.amount === -499.5, JSON.stringify(dupIssue));
    ok('S3b the duplicate explains the whole closing gap', Math.abs(a.closing.unexplained) < 0.01, JSON.stringify(a.closing));
}
// ── S4: sale row (DEP ref, NET) + raw Lenco-id row (GROSS) for the same credit, sweep present → duplicate only, no sweep alarm
{
    const c1 = txn({ type: 'credit', amount: 1015, balance: 1015, datetime: iso('2026-10-05') });
    const sw = txn({ type: 'debit', amount: 15, balance: 1000, datetime: '2026-10-05T08:00:30.000Z', narration: 'Split payment / 2627' });
    const refMap = new Map([[c1.id, 'DEP-1785927166093-8c102354-PL']]);
    const sale = row({ debit: 1000, description: 'Sale: The Full Stage', external_reference: 'DEP-1785927166093-8c102354-PL', date: '2026-10-05' });
    const raw = row({ debit: 1015, status: 'UNACCOUNTED', description: 'ERIC NGANDU MP260805', external_reference: c1.id, date: '2026-10-05', created_at: '2026-10-05T09:00:00Z' });
    const a = analyze(base({ ledger: chain([sale, raw]), txns: [c1, sw], refByTxnId: refMap, balance: { available: 1000, ledger: 1000 } }));
    ok('S4 sale(net)+raw(gross) → exactly one DUPLICATE_ROWS (raw row), keeper = the Sale row', has(a, 'DUPLICATE_ROWS') && a.issues.find(i => i.code === 'DUPLICATE_ROWS')!.keepId === sale.id && !has(a, 'SWEEP_MISSING'), JSON.stringify(codes(a)));
}
// ── S5: sweeps always happen
{
    const c1 = txn({ type: 'credit', amount: 87.18, balance: 87.18, datetime: iso('2026-10-09') });
    const refMap = new Map([[c1.id, 'DEP-1781103137436-c567f569-PUB']]);
    const sale = row({ debit: 85, description: 'Sale: Ordinary Ticket', external_reference: 'DEP-1781103137436-c567f569-PUB', date: '2026-10-09' });
    const swept = analyze(base({ ledger: chain([sale]), txns: [c1, txn({ type: 'debit', amount: 2.18, balance: 85, datetime: '2026-10-09T08:00:20.000Z', narration: 'Split payment / 2615' })], refByTxnId: refMap, balance: { available: 85, ledger: 85 } }));
    ok('S5a public sale booked net WITH its sweep → clean', swept.status === 'OK', JSON.stringify(swept.issues));
    const unswept = analyze(base({ ledger: chain([sale]), txns: [c1], refByTxnId: refMap, balance: { available: 87.18, ledger: 87.18 } }));
    const si = unswept.issues.find(i => i.code === 'SWEEP_MISSING');
    ok('S5b public sale booked net WITHOUT a sweep → SWEEP_MISSING for exactly the commission (K2.18), safe', !!si && si.amount === 2.18 && si.safe, JSON.stringify(unswept.issues));
    ok('S5c …and the K2.18 that is still in the account explains the closing gap', !has(unswept, 'CLOSING_UNEXPLAINED'), JSON.stringify(unswept.closing));
}
// ── S6: non-public credits are booked in FULL; a short booking is a retained-fee gap, a big gap is never auto-treated as a fee
{
    const c1 = txn({ type: 'credit', amount: 5.13, balance: 5.13, datetime: iso('2026-10-02') });
    const a = analyze(base({ ledger: chain([row({ debit: 5, description: 'Wallet Activation Deposit', external_reference: 'DEP-1782998996142-MWC20012-ACT', date: '2026-10-02' })]), txns: [c1], refByTxnId: new Map([[c1.id, 'DEP-1782998996142-MWC20012-ACT']]), balance: { available: 5.13, ledger: 5.13 } }));
    const fg = a.issues.find(i => i.code === 'FEE_RETAINED_GAP');
    ok('S6a activation deposit booked K5 vs K5.13 → FEE_RETAINED_GAP K0.13 (safe)', !!fg && fg.amount === 0.13 && fg.safe, JSON.stringify(a.issues));
    const c2 = txn({ type: 'credit', amount: 1000, balance: 1000, datetime: iso('2026-10-02') });
    const b = analyze(base({ ledger: chain([row({ debit: 700, description: 'Deposit', external_reference: c2.id, date: '2026-10-02' })]), txns: [c2], balance: { available: 1000, ledger: 1000 } }));
    ok('S6b a K300 shortfall on K1,000 is NOT treated as a fee → AMOUNT_MISMATCH, not safe', has(b, 'AMOUNT_MISMATCH') && !b.issues.find(i => i.code === 'AMOUNT_MISMATCH')!.safe && b.status === 'ATTENTION');
}
// ── S7: Blue Opus → Eagle's Nest forward is a REAL outflow; the platform sweep is not
{
    ok('S7a predicate: "To Blue Opus Software Technology / Split-Inflow Payment" is a platform sweep', isPlatformSweepDebit('To Blue Opus Software Technology / Split-Inflow Payment - 2627', null));
    ok('S7b predicate: "To BLUE OPUS- EAGLES NEST / Split-Inflow Payment" is NOT a sweep (genuine forward)', !isPlatformSweepDebit('To BLUE OPUS- EAGLES NEST / Split-Inflow Payment - 2627806092', null));
    ok('S7c predicate: "Split payment / …" and SPLIT- references are sweeps', isPlatformSweepDebit('Split payment / 262', null) && isPlatformSweepDebit('x', 'SPLIT-DEP-1'));
    ok('S7d predicate: ordinary debits are not sweeps', !isPlatformSweepDebit('Disbursement for Requisition #1 / 262', 'REQ-1-50'));
    const c1 = txn({ type: 'credit', amount: 547, balance: 547, datetime: iso('2026-10-05') });
    const f1 = txn({ type: 'debit', amount: 540.44, balance: 6.56, datetime: '2026-10-05T08:00:01.000Z', narration: 'To BLUE OPUS- EAGLES NEST / Split-Inflow Payment - 2627806092' });
    const a = analyze(base({ ledger: chain([row({ debit: 547, external_reference: c1.id, date: '2026-10-05' })]), txns: [c1, f1], balance: { available: 6.56, ledger: 6.56 } }));
    ok('S7e unbooked forward to Eagle\'s Nest → MISSING_IN_LEDGER (K540.44 out)', has(a, 'MISSING_IN_LEDGER') && Math.abs(a.issues.find(i => i.code === 'MISSING_IN_LEDGER')!.amount! + 540.44) < 0.01, JSON.stringify(a.issues));
}
// ── S8: reference counter behind (Kids Paradise, Fair Haven)
{
    const rows = chain([row({ debit: 10, reference_number: 'CR-2026-0491' }), row({ debit: 10, reference_number: 'REC-2026-0489', created_at: '2026-10-10T08:02:00Z' })]);
    const a = analyze(base({ ledger: rows, txns: [], counters: [{ entity_type: 'INFLOW', year: 2026, last_value: 480 }, { entity_type: 'ADJUSTMENT', year: 2026, last_value: 5 }], balance: { available: 20, ledger: 20 } }));
    const ci = a.issues.find(i => i.code === 'COUNTER_BEHIND');
    ok('S8a INFLOW counter 480 < CR-2026-0491 → COUNTER_BEHIND to 491 (safe)', !!ci && ci.entity!.to === 491 && ci.safe && a.issues.filter(i => i.code === 'COUNTER_BEHIND').length === 1, JSON.stringify(a.issues));
    const fine = analyze(base({ ledger: rows, txns: [], counters: [{ entity_type: 'INFLOW', year: 2026, last_value: 700 }], balance: { available: 20, ledger: 20 } }));
    ok('S8b a counter AHEAD of the numbers used is fine', !has(fine, 'COUNTER_BEHIND'));
}
// ── S9: stored running balance broken
{
    const rows = chain([row({ debit: 100, date: '2026-10-01' }), row({ debit: 50, date: '2026-10-02', created_at: '2026-10-02T08:00:00Z' })]);
    rows[1].balance_after = 999;
    const a = analyze(base({ ledger: rows, txns: [], balance: { available: 150, ledger: 150 } }));
    ok('S9 wrong balance_after → BALANCE_CHAIN_BROKEN (safe)', has(a, 'BALANCE_CHAIN_BROKEN') && a.issues.find(i => i.code === 'BALANCE_CHAIN_BROKEN')!.safe);
}
// ── S10: Lenco hold is reported, does not by itself demand action
{
    const c1 = txn({ type: 'credit', amount: 1000, balance: 1000 });
    const a = analyze(base({ ledger: chain([row({ debit: 1000, external_reference: c1.id })]), txns: [c1], balance: { available: 480.5, ledger: 1000 } }));
    ok('S10 availableBalance < ledgerBalance → FUNDS_ON_HOLD K519.50 (info), status stays OK', has(a, 'FUNDS_ON_HOLD') && a.issues[0].amount === 519.5 && a.status === 'OK', JSON.stringify(a));
}
// ── S11: failed payout still booked
{
    const rows = chain([row({ debit: 1000 }), row({ credit: 4018, entry_type: 'DISBURSEMENT', requisition_id: 'e565e225', status: 'DISBURSED', date: '2026-10-11', created_at: '2026-10-11T08:00:00Z' })]);
    const a = analyze(base({ ledger: rows, txns: [], payoutRefsByRequisition: new Map([['e565e225', ['REQ-e565e225-4000']]]), failedPayoutRefs: new Set(['REQ-e565e225-4000']), balance: { available: 1000, ledger: 1000 } }));
    ok('S11 payout failed at Lenco but booked as paid → FAILED_PAYOUT_BOOKED (needs a human)', has(a, 'FAILED_PAYOUT_BOOKED') && !a.issues.find(i => i.code === 'FAILED_PAYOUT_BOOKED')!.safe);
}
// ── S12: on-us transfer — the K30,000 vs K30,005 incident can never hide again
{
    const open = txn({ type: 'credit', amount: 82199.08, balance: 82199.08, datetime: iso('2026-10-01') });
    const d1 = txn({ type: 'debit', amount: 30000, balance: 52199.08, datetime: '2026-10-19T09:14:59.000Z', narration: 'MoneyWise Pay from Twalumbu Education Centre / 2629205432' });
    const good = analyze(base({ ledger: chain([row({ debit: 82199.08, external_reference: open.id, date: '2026-10-01' }), row({ credit: 30000, entry_type: 'DISBURSEMENT', requisition_id: 'r1', external_reference: d1.id, date: '2026-10-19', created_at: '2026-10-19T09:15:00Z' })]), txns: [open, d1], balance: { available: 52199.08, ledger: 52199.08 } }));
    ok('S12a on-us transfer booked K30,000 → clean', good.status === 'OK', JSON.stringify(good.issues));
    const bad = analyze(base({ ledger: chain([row({ debit: 82199.08, external_reference: open.id, date: '2026-10-01' }), row({ credit: 30005, entry_type: 'DISBURSEMENT', requisition_id: 'r1', external_reference: 'MWPAY-663b2ae8', date: '2026-10-19', created_at: '2026-10-19T09:15:00Z' })]), txns: [open, d1], balance: { available: 52199.08, ledger: 52199.08 } }));
    const mm = bad.issues.find(i => i.code === 'AMOUNT_MISMATCH');
    ok('S12b K30,005 booked for a K30,000 on-us transfer (MWPAY ref, no reference map) → AMOUNT_MISMATCH warning of K5', !!mm && mm.severity === 'warning' && mm.amount === -5 && bad.status === 'ATTENTION', JSON.stringify(bad.issues));
    const bad2 = analyze(base({ ledger: chain([row({ debit: 82199.08, external_reference: open.id, date: '2026-10-01' }), row({ credit: 30005, entry_type: 'DISBURSEMENT', requisition_id: 'r1', external_reference: 'MWPAY-663b2ae8', date: '2026-10-19', created_at: '2026-10-19T09:15:00Z' })]), txns: [open, d1], refByTxnId: new Map([[d1.id, 'MWPAY-663b2ae8']]), balance: { available: 52199.08, ledger: 52199.08 } }));
    ok('S12c same, with the transfer reference supplied (what production does) → identical verdict, closing fully explained', bad2.issues.some(i => i.code === 'AMOUNT_MISMATCH' && i.amount === -5) && !has(bad2, 'CLOSING_UNEXPLAINED'), JSON.stringify(bad2.issues));
    const dupOnus = analyze(base({ ledger: chain([row({ debit: 82199.08, external_reference: open.id, date: '2026-10-01' }), row({ credit: 30005, entry_type: 'DISBURSEMENT', requisition_id: 'r1', external_reference: 'MWPAY-663b2ae8', date: '2026-10-19', created_at: '2026-10-19T09:15:00Z' }), row({ credit: 30000, entry_type: 'EXPENSE', external_reference: d1.id, date: '2026-10-19', created_at: '2026-10-19T09:15:37Z' })]), txns: [open, d1], refByTxnId: new Map([[d1.id, 'MWPAY-663b2ae8']]), balance: { available: 52199.08, ledger: 52199.08 } }));
    ok('S12d the original incident (K30,005 + K30,000 EXPENSE for ONE debit) → DUPLICATE_ROWS removes the raw EXPENSE, keeper keeps the K5 mismatch flag', dupOnus.issues.some(i => i.code === 'DUPLICATE_ROWS' && i.amount === -30000) && dupOnus.issues.some(i => i.code === 'AMOUNT_MISMATCH' && i.amount === -5), JSON.stringify(dupOnus.issues.map(i => [i.code, i.amount])));
}
// ── S13: legit structure must not cause alarms — pre-cutoff history, change returns, internal transfers, sweeps
{
    const old = txn({ type: 'credit', amount: 100, balance: 100, datetime: iso('2026-01-05') });
    const chg = txn({ type: 'credit', amount: 160, balance: 260, datetime: iso('2026-10-03') }); const refs = new Map([[chg.id, 'CHG-1789837064626-9ef65b7f']]);
    const rows = chain([row({ debit: 100, entry_type: 'OPENING_BALANCE', date: '2026-03-18' }), row({ credit: 500, entry_type: 'ADJUSTMENT', description: 'Transfer: A -> B (Outflow)', wallet_id: 'w2', date: '2026-10-04' }), row({ debit: 500, entry_type: 'ADJUSTMENT', description: 'Transfer: A -> B (Inflow)', wallet_id: 'w1', date: '2026-10-04' })]);
    const a = analyze(base({ ledger: rows, txns: [old, chg], refByTxnId: refs, cutoffDate: '2026-03-18', balance: { available: 260, ledger: 260 } }));
    ok('S13 pre-cutoff history, CHG- netting credit and wallet↔wallet transfers raise no MISSING/duplicate alarms', !has(a, 'MISSING_IN_LEDGER') && !has(a, 'DUPLICATE_ROWS'), JSON.stringify(a.issues));
}
// ── S14: windowed (incremental) runs do not judge old history and do not claim a closing verdict
{
    const oldc = txn({ type: 'credit', amount: 50, balance: 50, datetime: iso('2026-08-01') });
    const a = analyze(base({ ledger: [], txns: [oldc], windowStart: '2026-10-01', complete: false, balance: { available: 50, ledger: 50 } }));
    ok('S14 incremental window ignores a Lenco credit older than the window and skips the closing verdict', a.issues.length === 0 && a.status === 'OK');
}
// ── S15: duplicates + residual fee gap on the keeper are both reported
{
    const c1 = txn({ type: 'credit', amount: 5.13, balance: 5.13, datetime: iso('2026-10-02') });
    const dep = row({ debit: 5, description: 'Wallet Activation Deposit', external_reference: 'DEP-1', status: 'COMPLETED', date: '2026-10-02' });
    const raw = row({ debit: 5.13, status: 'UNACCOUNTED', description: 'Stephen Kapambwe MP2610', external_reference: c1.id, date: '2026-10-02', created_at: '2026-10-02T09:00:00Z' });
    const a = analyze(base({ ledger: chain([dep, raw]), txns: [c1], refByTxnId: new Map([[c1.id, 'DEP-1']]), balance: { available: 5.13, ledger: 5.13 } }));
    ok('S15 Fair Haven-style pair (K5 deposit + K5.13 raw) → duplicate extra removed, keeper\'s K0.13 shortfall reported', has(a, 'DUPLICATE_ROWS') && has(a, 'FEE_RETAINED_GAP') && !has(a, 'CLOSING_UNEXPLAINED'), JSON.stringify(a.issues.map(i => [i.code, i.amount])));
}

// ── S16–S23: refinements learned from replaying the guardian over the live organizations
{
    // S16 history before the opening balance is covered by it (Twalumbu: 40 false "missing" rows before 2026-03-18)
    const early = txn({ type: 'credit', amount: 163.2, balance: 163.2, datetime: iso('2026-01-06') });
    const later = txn({ type: 'credit', amount: 100, balance: 263.2, datetime: iso('2026-10-02') });
    const rows = chain([row({ debit: 163.2, entry_type: 'OPENING_BALANCE', date: '2026-03-18' }), row({ debit: 100, external_reference: later.id, date: '2026-10-02' })]);
    const a = analyze(base({ ledger: rows, txns: [early, later], balance: { available: 263.2, ledger: 263.2 } }));
    ok('S16 a Lenco credit dated BEFORE the opening-balance row is not "missing" (the opening balance already contains it)', a.status === 'OK' && a.issues.length === 0, JSON.stringify(a.issues));
    // S17 FEERET- rows belong to the credit they top up (TAEMJA)
    const c1 = txn({ type: 'credit', amount: 5.13, balance: 5.13 });
    const a2 = analyze(base({ ledger: chain([row({ debit: 5, external_reference: c1.id }), row({ debit: 0.13, external_reference: `FEERET-${c1.id}`, created_at: '2026-10-10T09:00:00Z' })]), txns: [c1], balance: { available: 5.13, ledger: 5.13 } }));
    ok('S17 booked K5 + FEERET K0.13 for a K5.13 credit → clean (the adjunct row completes the booking)', a2.status === 'OK' && a2.issues.length === 0, JSON.stringify(a2.issues));
    // S18 a swept credit is fine whatever kind of row booked it (Lubangi K600 raw row + K10.80 sweep)
    const c2 = txn({ type: 'credit', amount: 610.8, balance: 610.8 }); const sw = txn({ type: 'debit', amount: 10.8, balance: 600, datetime: '2026-10-10T08:00:40.000Z', narration: 'Split payment / 26' });
    const a3 = analyze(base({ ledger: chain([row({ debit: 600, status: 'UNACCOUNTED', description: 'Chikomo Mayumbelo MP260910', external_reference: c2.id })]), txns: [c2, sw], balance: { available: 600, ledger: 600 } }));
    ok('S18 credit K610.80 booked K600 with a K10.80 sweep present → clean even though the row is not a "Sale:"', a3.status === 'OK' && a3.issues.length === 0, JSON.stringify(a3.issues));
    // S19 the settlement org keeps its own commission — nothing to sweep
    const c3 = txn({ type: 'credit', amount: 1.03, balance: 1.03 });
    const a4 = analyze(base({ isSettlementOrg: true, ledger: chain([row({ debit: 1, description: 'Sale: Test Payment (x1)', external_reference: c3.id })]), txns: [c3], balance: { available: 1.03, ledger: 1.03 } }));
    ok('S19 settlement org: a net-booked public sale is a retained-fee gap, never a missing sweep', has(a4, 'FEE_RETAINED_GAP') && !has(a4, 'SWEEP_MISSING'), JSON.stringify(a4.issues));
    // S20 an earlier manual REV-DUP reversal already neutralised a duplicate (Ndameni / Stephen's savings & investments)
    const d1 = txn({ type: 'debit', amount: 5, balance: 15, narration: 'Savings: Marriage Chilimba / 2628108743' }); const open = txn({ type: 'credit', amount: 20, balance: 20, datetime: iso('2026-10-01') });
    const orig = row({ credit: 5, entry_type: 'ADJUSTMENT', external_reference: 'SVT-1791455397327-QJ9T9U', date: '2026-10-10' });
    const dup = row({ credit: 5, entry_type: 'EXPENSE', external_reference: d1.id, created_at: '2026-10-10T09:00:00Z' });
    const rev = row({ debit: 5, entry_type: 'ADJUSTMENT', external_reference: `REV-DUP-${dup.id}`, created_at: '2026-10-10T10:00:00Z' });
    dup.id = 'aaaaaaaa-1111-2222-3333-444444444444'; rev.external_reference = `REV-DUP-${dup.id}`;
    const a5 = analyze(base({ ledger: chain([row({ debit: 20, external_reference: open.id, date: '2026-10-01' }), orig, dup, rev]), txns: [open, d1], refByTxnId: new Map([[d1.id, 'SVT-1791455397327-QJ9T9U']]), balance: { available: 15, ledger: 15 } }));
    ok('S20 a duplicate already reversed by a REV-DUP row is not re-flagged', !has(a5, 'DUPLICATE_ROWS') && a5.status === 'OK', JSON.stringify(a5.issues));
    // S21 the sweeper rounds the commission differently than credit−booked: a K0.05 difference still counts as swept
    const c4 = txn({ type: 'credit', amount: 87.13, balance: 87.13 }); const sw4 = txn({ type: 'debit', amount: 2.18, balance: 84.95, datetime: '2026-10-10T08:00:20.000Z', narration: 'Split payment / 2' });
    const a6 = analyze(base({ ledger: chain([row({ debit: 85, description: 'Sale: Ordinary Ticket (x1)', external_reference: c4.id })]), txns: [c4, sw4], balance: { available: 84.95, ledger: 84.95 } }));
    ok('S21 commission K2.18 swept vs gap K2.13 (rounding) → recognised as swept', !has(a6, 'SWEEP_MISSING') && !has(a6, 'FEE_RETAINED_GAP'), JSON.stringify(a6.issues));
    // S22 a sweep taken for a credit the ledger holds in full is reported and explains the closing gap (Kids Paradise MasterFees payments)
    const c5 = txn({ type: 'credit', amount: 15.02, balance: 15.02 }); const sw5 = txn({ type: 'debit', amount: 0.16, balance: 14.86, datetime: '2026-10-10T08:00:30.000Z', narration: 'To Blue Opus Software Technology / Split-Inflow Payment - 2' });
    const a7 = analyze(base({ ledger: chain([row({ debit: 15.02, external_reference: c5.id })]), txns: [c5, sw5], balance: { available: 14.86, ledger: 14.86 } }));
    ok('S22 commission swept from a credit booked in full → SWEEP_NOT_IN_LEDGER (safe: existing platform-fee-heal policy) and the K0.16 gap is explained', has(a7, 'SWEEP_NOT_IN_LEDGER') && a7.issues.find(i => i.code === 'SWEEP_NOT_IN_LEDGER')!.safe && !has(a7, 'CLOSING_UNEXPLAINED'), JSON.stringify(a7));
    // S23 Lubangi false positive: counter far behind the numbers of ANOTHER prefix, but nothing close ahead of it is used
    const a8 = analyze(base({ ledger: chain([row({ debit: 5, reference_number: 'CR-2026-0051' }), row({ debit: 5, reference_number: 'REC-2026-0274', created_at: '2026-10-10T08:05:00Z' })]), counters: [{ entity_type: 'INFLOW', year: 2026, last_value: 113 }], balance: { available: 10, ledger: 10 } }));
    ok('S23 counter 113 with used numbers 51 and 274 (no collision within reach) → no COUNTER_BEHIND', !has(a8, 'COUNTER_BEHIND'), JSON.stringify(a8.issues));
}

// ── P: property test — the closing-balance accounting identity holds for ANY mix of defects (seeded, deterministic)
{
    let rng = 123456789; const rnd = () => { rng = (rng * 1664525 + 1013904223) % 4294967296; return rng / 4294967296; };
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    let worst = 0, bad = 0, trials = 600, withIssues = 0;
    for (let k = 0; k < trials; k++) {
        const n = 3 + Math.floor(rnd() * 22); const txns: RawLencoTxn[] = []; const ledger: LedgerRow[] = []; const refMap = new Map<string, string>();
        let bal = 0, tcount = 0;
        const stamp = (m: number) => new Date(Date.parse('2026-10-05T08:00:00Z') + m * 61000).toISOString();
        const addTxn = (type: 'credit' | 'debit', amount: number, narration: string, fee = 0) => {
            bal = Math.round((bal + (type === 'credit' ? amount : -(amount + fee))) * 100) / 100;
            const t = { id: `p${k}-${++tcount}-aaaa-bbbb-cccc-dddddddddddd`, type, amount, datetime: stamp(tcount * 3), narration, balance: bal } as RawLencoTxn; txns.push(t); return t;
        };
        // an opening credit the ledger also holds as an opening-balance row (history before the cut-off)
        const op = { id: `p${k}-open-aaaa-bbbb-cccc-dddddddddddd`, type: 'credit', amount: 1000, datetime: '2026-02-01T08:00:00.000Z', narration: 'opening', balance: 1000 } as RawLencoTxn; txns.push(op); bal = 1000;
        ledger.push(row({ id: `o${k}`, debit: 1000, entry_type: 'OPENING_BALANCE', date: '2026-03-01', created_at: '2026-03-01T00:00:00Z' }));
        for (let i = 0; i < n; i++) {
            const kind = rnd();
            if (kind < 0.5) {                                                       // credit, maybe a public sale with a commission
                const net = Math.round((10 + rnd() * 900) * 100) / 100; const pub = rnd() < 0.6; const comm = pub ? Math.round(net * 0.02 * 100) / 100 : 0;
                const c = addTxn('credit', Math.round((net + comm) * 100) / 100, 'PAYER');
                let sweepIt = pub && rnd() < 0.8; const mode = rnd();
                if (sweepIt) { const s = addTxn('debit', comm, 'Split payment / ' + tcount); void s; }
                const booked = pub ? net : Math.round((net + comm) * 100) / 100;
                const ref = `DEP-${k}-${i}-${pub ? 'PUB' : 'X'}`; refMap.set(c.id, ref);
                if (mode < 0.08) continue;                                          // never booked
                ledger.push(row({ debit: booked, description: pub ? 'Sale: item' : 'Deposit', external_reference: mode < 0.5 ? c.id : ref, date: '2026-10-05', created_at: `2026-10-05T09:${String(i).padStart(2, '0')}:00Z` }));
                if (mode > 0.92) ledger.push(row({ debit: Math.round((net + comm) * 100) / 100, status: 'UNACCOUNTED', description: 'RAW', external_reference: c.id, date: '2026-10-05', created_at: `2026-10-05T10:${String(i).padStart(2, '0')}:00Z` }));
                if (mode > 0.85 && mode <= 0.92) ledger[ledger.length - 1].debit = Math.round((Number(ledger[ledger.length - 1].debit) + 0.37) * 100) / 100;   // wrong amount
            } else if (kind < 0.8) {                                                // debit with a bank fee
                const amt = Math.round((5 + rnd() * 400) * 100) / 100; const fee = pick([8.5, 10, 11, 12]);
                const d = addTxn('debit', amt, 'Disbursement for Requisition #' + i, fee); const mode = rnd();
                if (mode < 0.08) continue;
                ledger.push(row({ credit: Math.round((amt + fee) * 100) / 100, entry_type: 'EXPENSE', external_reference: d.id, date: '2026-10-05', created_at: `2026-10-05T11:${String(i).padStart(2, '0')}:00Z` }));
                if (mode > 0.9) ledger.push(row({ credit: Math.round((amt + fee) * 100) / 100, entry_type: 'EXPENSE', external_reference: d.id, date: '2026-10-05', created_at: `2026-10-05T12:${String(i).padStart(2, '0')}:00Z` }));
            } else if (kind < 0.9) {                                                // a manual / structural ledger entry with no Lenco counterpart
                ledger.push(row({ debit: Math.round(rnd() * 50 * 100) / 100, entry_type: 'ADJUSTMENT', description: 'Transfer: A -> B (Inflow)', date: '2026-10-05', created_at: `2026-10-05T13:${String(i).padStart(2, '0')}:00Z` }));
            } else {                                                                // a change-return credit (netting, never a ledger row)
                const c = addTxn('credit', Math.round((1 + rnd() * 60) * 100) / 100, 'CHG return'); refMap.set(c.id, 'CHG-17-' + i);
            }
        }
        chain(ledger);
        const a = analyze(base({ ledger, txns, refByTxnId: refMap, balance: { available: bal, ledger: bal }, now: Date.parse('2026-10-20T00:00:00Z') }));
        const u = Math.abs(a.closing.unexplained); worst = Math.max(worst, u); if (u > 0.02) bad++; if (a.issues.length) withIssues++;
    }
    ok(`P ${trials} random organisations with random defects: the ledger-vs-Lenco gap is ALWAYS fully attributed (worst unexplained K${worst.toFixed(3)}, ${bad} over K0.02; ${withIssues} had issues)`, bad === 0 && withIssues > 100, `bad=${bad} worst=${worst}`);
}
{
    // S24 an OLD unswept commission is reported but not auto-swept; a recent one is
    const mk = (day: string) => { const c = txn({ type: 'credit', amount: 87.13, balance: 87.13, datetime: iso(day) }); return analyze(base({ ledger: chain([row({ debit: 85, description: 'Sale: Ticket', external_reference: c.id, date: day })]), txns: [c], balance: { available: 87.13, ledger: 87.13 } })); };
    const old = mk('2026-06-12'), recent = mk('2026-10-15');
    ok('S24 a 4-month-old unswept commission is NOT safe to auto-sweep; a 5-day-old one is', !old.issues.find(i => i.code === 'SWEEP_MISSING')!.safe && recent.issues.find(i => i.code === 'SWEEP_MISSING')!.safe);
    // S25 free transfers: a same-second sweep with a scrambled running balance must not be charged a bank fee
    const a1 = txn({ type: 'credit', amount: 100, balance: 100 }); const sw1 = txn({ type: 'debit', amount: 3.81, balance: 96.2, narration: 'To Blue Opus Software Technology / Split-Inflow Payment - 2' });
    const a = analyze(base({ ledger: chain([row({ debit: 100, external_reference: a1.id })]), txns: [a1, sw1], balance: { available: 96.2, ledger: 96.2 } }));
    const sw = a.issues.find(i => i.code === 'SWEEP_NOT_IN_LEDGER');
    ok('S25 platform sweep gross = its amount (K3.81, not K3.81 + tariff) even when the running balance is a cent off', !!sw && sw.amount === 3.81, JSON.stringify(a.issues));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/**
 * Ledger corrections — pure decision tests (no database, no network):  npx ts-node --transpile-only src/scripts/test_ledger_corrections_core.ts
 * These pin the rules that keep a correction from being undone by the Master Fees sync, and keep every correction re-runnable.
 */
import { planFixDate, planUnverified, decideWalletMove, channelChanged, isWalletAccountType } from '../services/ledgerCorrections/core';

let pass = 0, fail = 0;
const ok = (name: string, cond: any, detail = '') => { if (cond) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${detail}`); } };
const ZAN = 'b3184aed-8806-46ec-9723-0625256f9866', NAT = 'c2d49c28-454d-4c61-a290-74cec5185c52';

// ── re-dating
{
    const e = { date: '2026-06-20', recorded_date: null, status: 'ACCOUNTED', verification_status: null };
    const p = planFixDate(e, '2026-05-04');
    ok('F1 an entry on the wrong date is re-dated and its original is kept', p.kind === 'APPLY' && p.newDate === '2026-05-04' && p.recordedDate === '2026-06-20', JSON.stringify(p));
    ok('F2 an ACCOUNTED (already in QuickBooks) entry is flagged for resync, never edited there', p.kind === 'APPLY' && p.qbResync === true);
    const again = planFixDate({ ...e, date: '2026-05-04', recorded_date: '2026-06-20' }, '2026-05-04');
    ok('F3 applying twice changes nothing the second time (idempotent)', again.kind === 'NOOP', JSON.stringify(again));
    const re = planFixDate({ ...e, date: '2026-05-04', recorded_date: '2026-06-20' }, '2026-05-05');
    ok('F4 re-dating again keeps the TRUE original (the first recorded date), not the intermediate one', re.kind === 'APPLY' && re.recordedDate === '2026-06-20', JSON.stringify(re));
    ok('F5 a COMPLETED entry (not in QuickBooks) is not flagged', (planFixDate({ date: '2026-06-20', status: 'COMPLETED' }, '2026-06-18') as any).qbResync === false);
    ok('F6 an Unverified entry is not re-dated', planFixDate({ date: '2026-06-20', verification_status: 'UNVERIFIED' }, '2026-06-18').kind === 'NOOP');
    ok('F7 a malformed date is refused', planFixDate(e, '04/05/2026').kind === 'NOOP' && planFixDate(e, '2026-13-45').kind === 'NOOP');
}
// ── unverified
{
    const p = planUnverified({ debit: 600, credit: 0, status: 'ACCOUNTED' });
    ok('U1 an inflow with no deposit is held at its full amount, flagged if already in QuickBooks', p.kind === 'APPLY' && p.heldAmount === 600 && p.qbResync === true, JSON.stringify(p));
    ok('U2 parking twice changes nothing (idempotent)', planUnverified({ debit: 0, credit: 0, verification_status: 'UNVERIFIED' }).kind === 'NOOP');
    ok('U3 an outflow or an already-zero row is never parked', planUnverified({ debit: 0, credit: 50 }).kind === 'NOOP' && planUnverified({ debit: 0, credit: 0 }).kind === 'NOOP');
}
// ── the Master Fees sync must not undo corrections
{
    const base = { lencoProcessed: false, currentAccountType: NAT, resolvedAccountType: ZAN, hasBankStatementReference: false, unverified: false, hasManualMove: false };
    ok('S1 Finance changes a payment from Natsave to Zanaco at Master Fees → the entry moves', decideWalletMove(base).move === true);
    ok('S2 …but not when it is already on the right wallet', decideWalletMove({ ...base, currentAccountType: ZAN }).move === false);
    ok('S3 …not when a person moved it (the sync will not pull it back)', decideWalletMove({ ...base, hasManualMove: true }).move === false);
    ok('S4 …not when it is matched to a bank statement', decideWalletMove({ ...base, hasBankStatementReference: true }).move === false);
    ok('S5 …not when it is parked as Unverified', decideWalletMove({ ...base, unverified: true }).move === false);
    ok('S6 …not for a Lenco-processed payment (the gateway is authoritative)', decideWalletMove({ ...base, lencoProcessed: true }).move === false);
    ok('S7 …never off a wallet into a generic bucket when the bank name is dropped', decideWalletMove({ ...base, resolvedAccountType: 'MASTERFEES_MANUAL' }).move === false);
    ok('S8 …and a bucket entry is left to the bucket rules, not this one', decideWalletMove({ ...base, currentAccountType: 'MASTERFEES_MANUAL' }).move === false);
}
// ── noticing a channel change on an already-synced payment (the routine tick otherwise only looks at amounts)
{
    const prior = { prior_account_name: 'natsave', prior_payment_method: 'bank' };
    ok('C1 Natsave → Zanaco is noticed', channelChanged(prior, { account_name: 'zanaco', payment_method: 'bank' }));
    ok('C2 an unchanged channel is not (case and spacing do not matter)', !channelChanged(prior, { account_name: ' Natsave ', payment_method: 'BANK' }));
    ok('C3 "no account name" → Zanaco is noticed', channelChanged({ prior_account_name: null, prior_payment_method: 'bank' }, { account_name: 'zanaco', payment_method: 'bank' }));
    ok('C4 a record stored before channels were kept is NOT re-examined', !channelChanged({ prior_account_name: null, prior_payment_method: null }, { account_name: 'zanaco', payment_method: 'bank' }));
    ok('C5 a brand-new payment (no prior) is handled by the normal path', !channelChanged(undefined, { account_name: 'zanaco' }));
}
ok('W1 wallet ids are recognised; buckets are not', isWalletAccountType(ZAN) && !isWalletAccountType('MASTERFEES_MANUAL') && !isWalletAccountType(null));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

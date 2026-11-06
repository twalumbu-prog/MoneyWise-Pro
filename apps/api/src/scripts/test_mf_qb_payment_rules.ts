/** QuickBooks payment scope + bank reconciliation — pure tests:  npx ts-node --transpile-only src/scripts/test_mf_qb_payment_rules.ts */
import { paymentInScope, bankReconciliationHold } from '../services/masterfees_qb/payment_rules';
let pass = 0, fail = 0;
const ok = (n: string, c: any, d = '') => { if (c) { pass++; console.log(`PASS  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); } };
const FROM = '2026-10-06', CF = '2026-08-01';
ok('S1 a payment completed after the start date is in scope', paymentInScope('2026-10-20T10:00:00Z', '2026-09-02', FROM, CF));
ok('S2 a September payment on a Term 3 invoice (inside the creation window) is in scope, so the invoice is not left unpaid in QuickBooks', paymentInScope('2026-09-12T10:00:00Z', '2026-09-02', FROM, CF));
ok('S3 a payment before the start date on an OLD invoice (Term 1) stays out of scope', !paymentInScope('2026-03-12T10:00:00Z', '2026-01-08', FROM, CF));
ok('S4 with no createFrom nothing changes: only payments on/after the start date', !paymentInScope('2026-09-12T10:00:00Z', '2026-09-02', FROM, null) && paymentInScope('2026-10-06T00:00:00Z', '2026-09-02', FROM, null));
ok('S5 a payment with no invoice date is not pulled in by the creation window', !paymentInScope('2026-09-12T10:00:00Z', null, FROM, CF));
const cov = new Map([['wallet-zanaco', '2026-11-03']]);
ok('B1 a payment on a wallet with a statement, matched to a line -> may go', bankReconciliationHold({ accountType: 'wallet-zanaco', date: '2026-07-04', linked: true }, cov) === null);
const h = bankReconciliationHold({ accountType: 'wallet-zanaco', date: '2026-07-04', linked: false }, cov);
ok('B2 same wallet, NOT matched to any statement line -> held, with the reason', !!h && /2026-11-03/.test(h), String(h));
ok('B3 a payment dated after the statement ends cannot be checked yet -> allowed', bankReconciliationHold({ accountType: 'wallet-zanaco', date: '2026-11-04', linked: false }, cov) === null);
ok('B4 a wallet with no statement imported is never held', bankReconciliationHold({ accountType: 'wallet-natsave', date: '2026-07-04', linked: false }, cov) === null);
ok('B5 a bucket entry (no wallet) is never held', bankReconciliationHold({ accountType: 'MASTERFEES_MANUAL', date: '2026-07-04', linked: false }, cov) === null && bankReconciliationHold({ accountType: null, date: '2026-07-04', linked: false }, cov) === null);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

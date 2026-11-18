/** Create guard — pure tests:  npx ts-node --transpile-only src/scripts/test_mf_qb_create_guard.ts */
import { possibleSameCharge, termOfDate } from '../services/masterfees_qb/create_guard';
import { QbInvoiceLike } from '../services/masterfees_qb/mf_qb_link';
let pass = 0, fail = 0;
const ok = (n: string, c: any, d = '') => { if (c) { pass++; console.log('PASS  ' + n); } else { fail++; console.log('FAIL  ' + n + ' ' + d); } };
const fam = (t: string) => /bus|transport|route|between|zone/i.test(t) ? 'transport' : /lunch|meal|canteen/i.test(t) ? 'canteen' : /tuition|term/i.test(t) ? 'tuition' : 'other';
const q = (id: string, date: string, desc: string, note = ''): QbInvoiceLike => ({ id, docNumber: id, date, customerId: 'c', customerName: 'S', privateNote: note, memo: '', totalAmt: 100, balance: 0, lines: [{ amount: 100, itemName: '', description: desc }] });
const fee = (family: string, description: string, issued: string, term: number | null, year: number | null) => ({ family, description, issued, due: issued, term, year });
const none = new Set<string>();

ok('T1 term of date: Dec = next year Term 1; Jan-Apr 1; May-Aug 2; Sep-Nov 3', termOfDate('2025-12-10')?.year === 2026 && termOfDate('2026-03-01')?.term === 1 && termOfDate('2026-07-01')?.term === 2 && termOfDate('2026-10-01')?.term === 3);
// daily lunches: other days' lunches are NOT the same charge
{ const r = possibleSameCharge(fee('canteen', 'Standard Lunch Meal - Mon 14th', '2026-09-14', 3, 2026), [q('1', '2026-09-15', 'Standard Lunch Meal - Tue 15th'), q('2', '2026-09-16', 'Standard Lunch Meal - Wed 16th')], fam, none, 'MW');
  ok('G1 lunches on other days do not block creating this day\'s lunch', r.length === 0, String(r.length)); }
{ const r = possibleSameCharge(fee('canteen', 'Standard Lunch Meal - Mon 14th', '2026-09-14', 3, 2026), [q('1', '2026-09-14', 'Standard Lunch Meal - Mon 14th')], fam, none, 'MW');
  ok('G2 the same day\'s lunch in QuickBooks DOES block (it is that charge)', r.length === 1); }
// transport: neighbouring term does not block, same term does
{ const r = possibleSameCharge(fee('transport', 'CHS03 - Between A & B (Term 3)', '2026-09-10', 3, 2026), [q('1', '2026-07-12', 'CHS03 - Between A & B', 'Term 2')], fam, none, 'MW');
  ok('G3 a Term 2 transport invoice does not block Term 3', r.length === 0, String(r.length)); }
{ const r = possibleSameCharge(fee('transport', 'CHS03 - Between A & B (Term 3)', '2026-09-10', 3, 2026), [q('1', '2026-09-08', 'CHS03 - Between A & B Term 3')], fam, none, 'MW');
  ok('G4 a same-term transport invoice blocks', r.length === 1); }
// last year's invoice never blocks
{ const r = possibleSameCharge(fee('tuition', 'Grade 4 Tuition - Term 3', '2026-09-10', 3, 2026), [q('1', '2025-09-03', 'TERM 3')], fam, none, 'MW');
  ok('G5 last year\'s "TERM 3" does not block this year\'s Term 3', r.length === 0, String(r.length)); }
// already used by another MF invoice: it is that invoice's, not evidence for this one
{ const r = possibleSameCharge(fee('tuition', 'Grade 4 Tuition - Term 3', '2026-09-10', 3, 2026), [q('1', '2026-09-08', 'TERM 3')], fam, new Set(['1']), 'MW');
  ok('G6 a QuickBooks invoice already linked to another Master Fees invoice does not block', r.length === 0); }
{ const r = possibleSameCharge(fee('tuition', 'Grade 4 Tuition - Term 3', '2026-09-10', 3, 2026), [q('1', '2026-09-08', 'TERM 3', 'MoneyWise/MasterFees reconciliation. Ref: X')], fam, none, 'MoneyWise/MasterFees reconciliation. Ref: ');
  ok('G7 MoneyWise\'s own invoices never count as a guess', r.length === 0); }
// no year on the MF side behaves as before (term only)
{ const r = possibleSameCharge(fee('tuition', 'Tuition', '2026-09-10', 3, null), [q('1', '2026-09-08', 'TERM 3')], fam, none, 'MW');
  ok('G8 no Master Fees year: still blocked by a same-term invoice', r.length === 1); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

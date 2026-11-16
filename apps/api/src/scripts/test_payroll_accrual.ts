/** Payroll accrual journals — pure tests:  npx ts-node --transpile-only src/scripts/test_payroll_accrual.ts
 *  Figures are Twalumbu's October 2026 payroll sheet (the journal it prescribes and that is now in QuickBooks, JE 21566). */
import { buildAccrualLines, buildAllocationLines, RunTotals } from '../services/payrollAccrual.service';

let pass = 0, fail = 0;
const ok = (name: string, cond: any, detail = '') => { if (cond) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${detail}`); } };
const sum = (ls: any[], k: 'debit' | 'credit') => Math.round(ls.reduce((a, l) => a + l[k], 0) * 100) / 100;
const by = (ls: any[], role: string) => ls.find(l => l.role === role);

const OCT: RunTotals = { gross: 160561.24, napsa_employee: 4185, napsa_employer: 4185, nhima_employee: 1033.5, nhima_employer: 1033.5, paye: 4344.57, school_fees: 8516.67, salary_advances: 1000, loans: 3833.33, other_deductions: 0, net: 137648.17 };

{ const l = buildAccrualLines(OCT, 'October 2026');
  ok('A1 October accrual balances at K165,779.74', sum(l, 'debit') === 165779.74 && sum(l, 'credit') === 165779.74, `${sum(l, 'debit')} / ${sum(l, 'credit')}`);
  ok('A2 salaries debited at gross', by(l, 'salaries').debit === 160561.24);
  ok('A3 NAPSA payable is employee + employer (K8,370), NHIMA payable K2,067', by(l, 'napsa_payable').credit === 8370 && by(l, 'nhima_payable').credit === 2067);
  ok('A4 PAYE payable K4,344.57', by(l, 'paye_payable').credit === 4344.57);
  ok('A5 deductions control gets school fees + advances + loans (K13,350)', by(l, 'deductions_control').credit === 13350, String(by(l, 'deductions_control').credit));
  ok('A6 net pay control K137,648.17', by(l, 'net_pay_control').credit === 137648.17); }
{ const l = buildAllocationLines(OCT, 'October 2026');
  ok('B1 allocation clears deductions control in full', sum(l, 'debit') === 13350 && sum(l, 'credit') === 13350);
  ok('B2 split into receivables / advances / loans', by(l, 'school_fees_receivable').credit === 8516.67 && by(l, 'salary_advances').credit === 1000 && by(l, 'staff_loans').credit === 3833.33); }
{ const none = buildAllocationLines({ ...OCT, school_fees: 0, salary_advances: 0, loans: 0, other_deductions: 0 }, 'x');
  ok('B3 no deductions -> no allocation journal', none.length === 0); }
{ let threw = false; try { buildAccrualLines({ ...OCT, net: 137000 }, 'bad'); } catch { threw = true; }
  ok('C1 a run that does not foot is refused (nothing is posted)', threw); }
{ const l = buildAccrualLines({ ...OCT, other_deductions: 540, net: 137108.17 }, 'July 2026');
  ok('D1 staff purchases deducted from pay join the deductions control credit', by(l, 'deductions_control').credit === 13890, String(by(l, 'deductions_control').credit)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

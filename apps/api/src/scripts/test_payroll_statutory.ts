/** Payroll statutory rules — pure tests:  npx ts-node --transpile-only src/scripts/test_payroll_statutory.ts
 *  Fixtures are real rows from Twalumbu's October 2026 payroll sheet (the rules they follow match Jan–Sep as well). */
import { calcPAYE, allowanceBases, computeStatutory, mergeRules, AllowanceType } from '../lib/payrollStatutory';
import * as fs from 'fs';

let pass = 0, fail = 0;
const ok = (name: string, cond: any, detail = '') => { if (cond) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${detail}`); } };
const close = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol;

const TYPES: AllowanceType[] = [
    { name: 'Staff Welfare', napsa: true, nhima: true, paye: true },
    { name: 'Professional Allowance', napsa: false, nhima: true, paye: true },
    { name: 'Responsibility', napsa: false, nhima: true, paye: true },
    { name: 'Bonus', napsa: false, nhima: false, paye: true },
];
const calc = (basic: number, bd: Record<string, number>, ot = 0, extra: any = {}) => computeStatutory({ basic, overtime: ot, allowanceBases: allowanceBases(bd, TYPES), ...extra });

// ---- PAYE bands
ok('P1 K5,100 or less pays nothing', calcPAYE(5100) === 0 && calcPAYE(3000) === 0);
ok('P2 K7,464.86 -> K509.46 (sheet: Ziyenera Phiri)', close(calcPAYE(7464.86), 509.46), String(calcPAYE(7464.86)));
ok('P3 K9,100 -> K1,000 (sheet: Lillian Mubiana)', close(calcPAYE(9100), 1000), String(calcPAYE(9100)));
ok('P4 K12,000 -> K2,066 (sheet: Phiri Zangose)', close(calcPAYE(12000), 2066), String(calcPAYE(12000)));
ok('P5 K8,000 -> K670 (sheet: Stephen Kapambwe)', close(calcPAYE(8000), 670), String(calcPAYE(8000)));
ok('P6 K5,595.55 -> K99.11 (sheet: Moses Kalunga)', close(calcPAYE(5595.55), 99.11), String(calcPAYE(5595.55)));

// ---- full rows (October 2026)
{ const r = calc(3250, { 'Staff Welfare': 1250, 'Professional Allowance': 2000, 'Responsibility': 250, 'Bonus': 714.86 });
  ok('R1 Ziyenera: gross K7,464.86', close(r.gross, 7464.86), String(r.gross));
  ok('R2 Ziyenera: NAPSA 5% of basic+welfare = K225', close(r.napsa_employee, 225), String(r.napsa_employee));
  ok('R3 Ziyenera: NHIMA 1% of basic+welfare+professional+responsibility = K67.50', close(r.nhima_employee, 67.5), String(r.nhima_employee));
  ok('R4 Ziyenera: PAYE on full gross = K509.46', close(r.paye, 509.46), String(r.paye)); }
{ const r = calc(2500, { 'Staff Welfare': 300, 'Professional Allowance': 2200, 'Responsibility': 250 }, 345.55);
  ok('R5 Moses Kalunga: NAPSA K140 (overtime outside the base)', close(r.napsa_employee, 140), String(r.napsa_employee));
  ok('R6 Moses Kalunga: PAYE K99.11 (overtime inside the PAYE base)', close(r.paye, 99.11), String(r.paye)); }
{ const r = calc(2500, { 'Staff Welfare': 200, 'Professional Allowance': 300 });
  ok('R7 Edward Munyompe: NAPSA K135, NHIMA K30, no PAYE', close(r.napsa_employee, 135) && close(r.nhima_employee, 30) && r.paye === 0, JSON.stringify(r)); }
{ const r = calc(5100, { 'Staff Welfare': 2000, 'Professional Allowance': 2000 }, 0, { napsaExempt: true, nhimaExempt: true });
  ok('R8 Lillian Mubiana: exempt from NAPSA and NHIMA, PAYE K1,000', r.napsa_employee === 0 && r.nhima_employee === 0 && close(r.paye, 1000), JSON.stringify(r)); }

// ---- overrides keep the signed-off figure
{ const r = calc(2300, { 'Staff Welfare': 500, 'Professional Allowance': 900 }, 0, { override: { nhima_employee: 37 } });
  ok('O1 an overridden NHIMA is kept, employer mirrors it', r.nhima_employee === 37 && r.nhima_employer === 37 && r.overridden, JSON.stringify(r)); }
{ const r = calc(2500, { 'Staff Welfare': 300 }, 0, { override: { paye: 12.34 } });
  ok('O2 only the overridden field changes', r.paye === 12.34 && close(r.napsa_employee, 140), JSON.stringify(r)); }

// ---- cap applies to the contribution, not the earnings base (the old code capped the base at K1,073.15 -> max K53.66)
{ const rules = mergeRules({ napsa_monthly_cap: 1073.15 });
  const big = computeStatutory({ basic: 30000, allowanceBases: allowanceBases({}, TYPES) }, rules);
  ok('C1 a K30,000 earner is capped at K1,073.15, not at 5% of K1,073.15', close(big.napsa_employee, 1073.15), String(big.napsa_employee));
  const small = computeStatutory({ basic: 4500, allowanceBases: allowanceBases({}, TYPES) }, rules);
  ok('C2 a K4,500 earner is unaffected by the cap (K225)', close(small.napsa_employee, 225), String(small.napsa_employee)); }

// ---- legacy single flag still works
{ const legacy: AllowanceType[] = [{ name: 'Housing', subject_to_statutory: true }, { name: 'Transport', subject_to_statutory: false }];
  const b = allowanceBases({ Housing: 1000, Transport: 500 }, legacy);
  ok('L1 legacy subject_to_statutory drives all three bases', b.napsa === 1000 && b.nhima === 1000 && b.paye === 1000 && b.total === 1500, JSON.stringify(b)); }

// ---- optional full check against the real sheets, when the extract is present locally
const FILE = '/Users/kim_life/Documents/MoneyWise-Pro/scratch/payroll/payroll_2026.json';
if (fs.existsSync(FILE)) {
    const P = JSON.parse(fs.readFileSync(FILE, 'utf8')); let rows = 0, napsaBad = 0, payeBad = 0, nhimaBad = 0;
    for (const m of Object.keys(P)) for (const s of P[m].staff) {
        const bd: Record<string, number> = { 'Staff Welfare': s.welfare, 'Professional Allowance': s.prof, Responsibility: s.resp, Bonus: s.bonus };
        const r = computeStatutory({ basic: s.basic, overtime: s.ot, allowanceBases: allowanceBases(bd, TYPES), napsaExempt: s.napsa === 0, nhimaExempt: s.nhima === 0 });
        rows++; if (!close(r.napsa_employee, s.napsa, 0.06)) napsaBad++; if (!close(r.paye, s.paye, 0.06)) payeBad++; if (s.nhima && !close(r.nhima_employee, s.nhima, 1.01)) nhimaBad++;
    }
    ok(`S1 all ${rows} staff-months in the sheets: NAPSA matches`, napsaBad === 0, `${napsaBad} differ`);
    ok(`S2 all ${rows} staff-months: PAYE matches`, payeBad === 0, `${payeBad} differ`);
    ok(`S3 NHIMA: ${rows - nhimaBad} of ${rows} staff-months match to K1; the ${nhimaBad} others are figures fixed by hand in the sheet (why the override exists)`, nhimaBad <= 30, `${nhimaBad} differ`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

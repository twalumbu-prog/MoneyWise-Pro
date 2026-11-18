/** Pure: npx ts-node --transpile-only src/scripts/test_lenco_gross.ts */
import { computeDebitGross, isFreeOnUsDebit } from '../utils/lencoGross';
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${c ? '' : d}`); };
const tariff = (_a: number) => 8.5;
const g = (o: any) => computeDebitGross({ tariff, ...o });

// the real incident: K2.19 forward, balance 1158.46 -> 1156.28 (drop 2.18)
ok('15 Nov Blue Opus forward books K2.19, not K10.69', g({ amount: 2.19, prevBalance: 1158.46, curBalance: 1156.28, narration: 'To BLUE OPUS- SIBAS SALOON / Split-Inflow Payment - 2631918038' }) === 2.19);
ok('rounding noise on an ordinary payout is not charged the tariff', g({ amount: 100, prevBalance: 500, curBalance: 400.01, narration: 'Disbursement' }) === 100);
ok('normal bank payout: gross = balance drop (amount + fee)', g({ amount: 100, prevBalance: 500, curBalance: 391.5 }) === 108.5);
ok('on-us forward whose balance drop equals the amount', g({ amount: 6.04, prevBalance: 1162.28, curBalance: 1156.24, narration: 'To BLUE OPUS- SIBAS SALOON / Split-Inflow Payment - 1' }) === 6.04);
ok('ordering artefact on a bank payout falls back to the tariff', g({ amount: 250, prevBalance: 100, curBalance: 900, narration: 'Payroll' }) === 258.5);
ok('ordering artefact on an on-us forward does NOT get the tariff', g({ amount: 2.19, prevBalance: 5, curBalance: 900, narration: 'To BLUE OPUS- X / Split-Inflow Payment - 9' }) === 2.19);
ok('ordering artefact on an MWPAY- reference is free', g({ amount: 30000, prevBalance: 1, curBalance: 2, reference: 'MWPAY-abc' }) === 30000);
ok('missing balances on a bank payout use the tariff', g({ amount: 100, prevBalance: null, curBalance: null }) === 108.5);
ok('missing balances on an on-us forward are free', g({ amount: 10, prevBalance: null, curBalance: null, narration: 'To BLUE OPUS- X / Split-Inflow Payment - 9' }) === 10);
ok('a payout to a person named "To" is not mistaken for on-us', !isFreeOnUsDebit('To John Banda / mobile money payout'));
ok('fee above the plausibility cap is rejected', g({ amount: 100, prevBalance: 500, curBalance: 300 }) === 108.5);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

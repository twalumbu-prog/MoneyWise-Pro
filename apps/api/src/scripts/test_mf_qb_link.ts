/**
 * Master Fees <-> QuickBooks invoice matching — pure tests (no network):  npx ts-node --transpile-only src/scripts/test_mf_qb_link.ts
 * Focus: the IMP- tier (Master Fees payment references like IMP-34655-R349 carry the QuickBooks DocNumber of an invoice that was imported FROM QuickBooks).
 */
import { buildImpDocIndex, buildMfNumberIndex, findQbInvoiceForItem, QbInvoiceLike } from '../services/masterfees_qb/mf_qb_link';

let pass = 0, fail = 0;
const ok = (name: string, cond: any, detail = '') => { if (cond) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${detail}`); } };
const inv = (o: Partial<QbInvoiceLike> & { id: string; docNumber: string; totalAmt: number; customerId?: string }): QbInvoiceLike =>
    ({ date: '2026-01-15', customerId: 'c1', customerName: 'A STUDENT', privateNote: '', memo: '', balance: 0, lines: [{ amount: o.totalAmt, itemName: 'SCHOOL FEES', description: 'Term 1 fees' }], ...o } as QbInvoiceLike);
const run = (mfNum: string, desc: string, amt: number, cust: QbInvoiceLike[], all: QbInvoiceLike[], claimed: Set<string>, impDoc: string | null, term: number | null = 1) =>
    findQbInvoiceForItem(mfNum, desc, amt, cust, buildMfNumberIndex(all), claimed, { mfTerm: term, impDocNumber: impDoc, qbByDoc: new Map(cust.filter(q => q.docNumber).map(q => [q.docNumber, q] as [string, QbInvoiceLike])) });

// ---- the index of IMP references
{ const idx = buildImpDocIndex([{ reference: 'IMP-34655-R349', invoice_id: 'inv-1' }, { reference: 'MAN-123', invoice_id: 'inv-2' }, { reference: 'IMP-9-R1' }, { reference: 'imp-77-R2', invoice_id: 'inv-3' }]);
  ok('I1 IMP-<DocNumber>-R<n> maps the MF invoice to the QuickBooks DocNumber; other references and rows without an invoice are ignored', idx.get('inv-1') === '34655' && !idx.has('inv-2') && idx.size === 1, JSON.stringify([...idx])); }

// ---- the IMP tier
{ const q = inv({ id: '9001', docNumber: '34655', totalAmt: 720, description: undefined } as any);
  const r = run('INV-X', 'Term 1 fees', 720, [q], [q], new Set(), '34655');
  ok('M1 IMP reference + same student + same amount -> linked (IMP_DOCNUM)', r.tier === 'IMP_DOCNUM' && r.invoice?.id === '9001', JSON.stringify(r)); }
{ const q = inv({ id: '9002', docNumber: '11481', totalAmt: 1190.02 });
  const r = run('INV-X', 'Term 1 fees', 1190, [q], [q], new Set(), '11481');
  ok('M2 a K0.02 rounding difference is accepted (K1,190 vs K1,190.02)', r.tier === 'IMP_DOCNUM', JSON.stringify(r)); }
{ const q = inv({ id: '9003', docNumber: '10851', totalAmt: 310 });
  const r = run('INV-X', 'Term 1 fees', 20, [q], [q], new Set(), '10851');
  ok('M3 right student and named invoice but the amount is wrong (MF K20 vs QB K310) -> NOT linked, and reported as a mismatch (not "missing")', r.tier === 'NONE' && r.impMismatch?.docNumber === '10851' && r.impMismatch?.qbTotal === 310, JSON.stringify(r)); }
{ const other = inv({ id: '9004', docNumber: '555', totalAmt: 500, customerId: 'c2', customerName: 'SOMEONE ELSE' }); const mine = inv({ id: '9005', docNumber: '556', totalAmt: 500 });
  const r = run('INV-X', 'Term 1 fees', 500, [mine], [mine, other], new Set(), '555');
  ok('M4 an IMP DocNumber that belongs to ANOTHER student is never used (and is not reported as this student\'s mismatch)', r.invoice?.id !== '9004' && !r.impMismatch, JSON.stringify(r)); }
{ const q = inv({ id: '9006', docNumber: '700', totalAmt: 400 });
  const r = run('INV-X', 'Term 1 fees', 400, [q], [q], new Set(['9006']), '700');
  ok('M5 an invoice already claimed by another payment/invoice is not linked twice', r.tier === 'NONE' || r.invoice?.id !== '9006', JSON.stringify(r)); }
{ const imp = inv({ id: '9007', docNumber: '800', totalAmt: 600 }); const tagged = inv({ id: '9008', docNumber: '801', totalAmt: 600, privateNote: 'MoneyWise/MasterFees reconciliation. Ref: INV-AUTO-1' });
  const r = run('INV-AUTO-1', 'Term 1 fees', 600, [imp, tagged], [imp, tagged], new Set(), '800');
  ok('M6 an explicit "Ref: <this MF invoice>" note still outranks the IMP reference', r.tier === 'MF_NUMBER' && r.invoice?.id === '9008', JSON.stringify(r)); }
{ const q = inv({ id: '9009', docNumber: '900', totalAmt: 250, lines: [{ amount: 250, itemName: 'X', description: 'Grade 2 Tuition - Term 1' }] });
  const r = run('INV-X', 'Grade 2 Tuition - Term 1', 250, [q], [q], new Set(), null);
  ok('M7 with no IMP reference the old description + amount rule still works (nothing regressed)', r.tier === 'DESCRIPTION' && r.invoice?.id === '9009', JSON.stringify(r)); }
{ const q = inv({ id: '9010', docNumber: '901', totalAmt: 100 });
  const r = run('INV-X', 'Term 1 fees', 999, [q], [q], new Set(), null);
  ok('M8 an invoice that exists nowhere is still NONE, with no mismatch claimed', r.tier === 'NONE' && !r.impMismatch); }
{ const q = inv({ id: '9011', docNumber: '902', totalAmt: 100 });
  const r = findQbInvoiceForItem('INV-X', 'Term 1 fees', 100, [q], buildMfNumberIndex([q]), new Set(), { mfTerm: 1 });
  ok('M9 callers that pass no IMP data behave exactly as before', r.tier !== 'IMP_DOCNUM'); }

// ---- school year (Makupe Tobias, Nov 2026: 2026 Term 3 transport K1,500 linked to the 2025 "TERM 3" K1,500 invoice)
const yr = (date: string, desc: string) => inv({ id: 'y' + date, docNumber: 'D' + date, totalAmt: 1500, date, lines: [{ amount: 1500, itemName: 'Bus', description: desc }] } as any);
{ const last = yr('2025-09-03', 'TERM 3');
  const r = findQbInvoiceForItem('INV-Y', 'KAT10 - Between Katende', 1500, [last], buildMfNumberIndex([last]), new Set(), { mfTerm: 3, mfYear: 2026 });
  ok('Y1 a 2025 "TERM 3" invoice is NOT Term 3 of 2026 (same student, same amount)', r.tier === 'NONE', JSON.stringify(r)); }
{ const last = yr('2025-09-03', 'TERM 3'), now = yr('2026-09-02', 'TERM 3');
  const r = findQbInvoiceForItem('INV-Y', 'KAT10 - Between Katende', 1500, [last, now], buildMfNumberIndex([last, now]), new Set(), { mfTerm: 3, mfYear: 2026 });
  ok('Y2 with both years present, the 2026 invoice is chosen', r.invoice?.id === 'y2026-09-02', JSON.stringify(r)); }
{ const dec = yr('2025-12-10', 'TERM 1');
  const r = findQbInvoiceForItem('INV-Y', 'Tuition', 1500, [dec], buildMfNumberIndex([dec]), new Set(), { mfTerm: 1, mfYear: 2026 });
  ok('Y3 a December invoice counts as Term 1 of the NEXT year', r.tier === 'TERM_AMOUNT' && r.invoice?.id === 'y2025-12-10', JSON.stringify(r)); }
{ const last = yr('2025-09-03', 'KAT10 - Between Katende');
  const r = findQbInvoiceForItem('INV-Y', 'KAT10 - Between Katende', 1500, [last], buildMfNumberIndex([last]), new Set(), { mfTerm: 3, mfYear: 2026 });
  ok('Y4 the year also blocks an identical-description match from last year', r.tier === 'NONE', JSON.stringify(r)); }
{ const last = yr('2025-09-03', 'TERM 3');
  const r = findQbInvoiceForItem('INV-Y', 'KAT10', 1500, [last], buildMfNumberIndex([last]), new Set(), { mfTerm: 3 });
  ok('Y5 callers that pass no year behave exactly as before', r.tier === 'TERM_AMOUNT', JSON.stringify(r)); }


// ---- daily lunches must not match on term + amount (Beatrice Mpande, Nov 2026)
{ const nov = inv({ id: 'L1', docNumber: 'L1', totalAmt: 35, date: '2026-11-09', lines: [{ amount: 35, itemName: 'CANTEEN SERVICES', description: 'Standard Lunch Meal - Thu, 12 Nov 2026' }] } as any);
  const r = findQbInvoiceForItem('INV-L', 'Standard Lunch Meal - Thu 1st', 35, [nov], buildMfNumberIndex([nov]), new Set(), { mfTerm: 3, mfYear: 2026 });
  ok('Z1 a different day\'s K35 lunch is NOT the "Thu 1st" lunch', r.tier === 'NONE', JSON.stringify(r)); }
{ const same = inv({ id: 'L2', docNumber: 'L2', totalAmt: 35, date: '2026-09-11', lines: [{ amount: 35, itemName: 'CANTEEN SERVICES', description: 'Standard Lunch Meal - Thu 1st' }] } as any);
  const r = findQbInvoiceForItem('INV-L', 'Standard Lunch Meal - Thu 1st', 35, [same], buildMfNumberIndex([same]), new Set(), { mfTerm: 3, mfYear: 2026 });
  ok('Z2 the same wording still matches (tier 2)', r.tier === 'DESCRIPTION'); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

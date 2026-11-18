/** Invoice-level reconcile — pure tests:  npx ts-node --transpile-only src/scripts/test_mf_qb_invoice_reconcile.ts */
import { planInvoice, pairItems } from '../services/masterfees_qb/invoice_reconcile';
let pass = 0, fail = 0;
const ok = (n: string, c: any, d = '') => { if (c) { pass++; console.log('PASS  ' + n); } else { fail++; console.log('FAIL  ' + n + ' ' + d); } };
const qb = (id: string, total: number, balance: number, date = '2026-09-01') => ({ id, total, balance, date });
const pay = (id: string, amount: number, date = '2026-10-01') => ({ id, amount, date });

{ const r = planInvoice({ total: 1700, paid: 1700, items: [{ amount: 1700, paid_amount: 1700 }] }, [qb('q1', 1700, 0)], [pay('p1', 700)], [{ id: 'Q9', date: '2026-10-01', applied: { q1: 1700 } }]);
  ok('R1 QuickBooks already shows it paid -> LINK to the existing payment, nothing posted', r.action === 'LINK' && r.links?.[0].qbPaymentIds[0] === 'Q9' && !r.posts, JSON.stringify(r)); }
{ const r = planInvoice({ total: 1700, paid: 1700, items: [{ amount: 1700, paid_amount: 1700 }] }, [qb('q1', 1700, 1000)], [pay('p1', 1000)], []);
  ok('R2 QuickBooks short by exactly the unposted amount -> POST that amount', r.action === 'POST' && r.posts?.[0].lines[0].amount === 1000, JSON.stringify(r)); }
{ const r = planInvoice({ total: 1700, paid: 1500, items: [{ amount: 1700, paid_amount: 1500 }] }, [qb('q1', 1700, 100)], [pay('p1', 700)], []);
  ok('R3 QuickBooks shows MORE paid than Master Fees -> EXCEPTION, nothing posted', r.action === 'EXCEPTION' && /MORE/.test(r.reason), JSON.stringify(r)); }
{ const r = planInvoice({ total: 2855, paid: 800, items: [{ amount: 1155, paid_amount: 0 }, { amount: 1700, paid_amount: 800 }] }, [qb('t', 1155, 1155), qb('f', 1700, 1700)], [pay('p1', 800)], []);
  ok('R4 multi-item: the payment goes to the item Master Fees says it paid (tuition), not the first item', r.action === 'POST' && r.posts?.[0].lines.length === 1 && r.posts[0].lines[0].invoiceId === 'f', JSON.stringify(r)); }
{ const r = planInvoice({ total: 855, paid: 500, items: [{ amount: 855, paid_amount: 500 }] }, [qb('a', 285, 285, '2026-06-01'), qb('b', 285, 285, '2026-07-01'), qb('c', 285, 285, '2026-08-01')], [pay('p1', 500)], []);
  ok('R5 termly fee as 3 monthly QuickBooks invoices -> 285 + 215, oldest first', r.action === 'POST' && JSON.stringify(r.posts?.[0].lines) === JSON.stringify([{ invoiceId: 'a', amount: 285 }, { invoiceId: 'b', amount: 215 }]), JSON.stringify(r)); }
{ const r = planInvoice({ total: 1500, paid: 1500, items: [{ amount: 1500, paid_amount: 1500 }] }, [qb('q', 1400, 0)], [pay('p', 100)], []);
  ok('R6 invoice totals differ -> EXCEPTION', r.action === 'EXCEPTION' && /totals differ/.test(r.reason)); }
{ const r = planInvoice({ total: 1000, paid: 1000, items: [{ amount: 1000, paid_amount: 1000 }] }, [qb('q', 1000, 600)], [pay('p1', 700)], []);
  ok('R7 only part of the unposted amount is missing -> EXCEPTION (part is already in QuickBooks)', r.action === 'EXCEPTION' && /already there/.test(r.reason), JSON.stringify(r)); }
{ const r = planInvoice({ total: 1000, paid: 1000, items: [{ amount: 1000, paid_amount: 1000 }] }, [qb('q', 1000, 0)], [pay('p', 1000)], []);
  ok('R8 paid in QuickBooks but no unclaimed payment to link to -> EXCEPTION', r.action === 'EXCEPTION' && /no unclaimed/.test(r.reason)); }
{ const r = planInvoice({ total: 1000, paid: 1000, items: [{ amount: 1000, paid_amount: 1000 }] }, [qb('q', 1000, 0)], [pay('p1', 400), pay('p2', 600)], [{ id: 'Q1', date: '2026-10-01', applied: { q: 1000 } }]);
  ok('R9 two payments share one bigger QuickBooks payment -> both linked to it, capacity respected', r.action === 'LINK' && r.links?.length === 2, JSON.stringify(r)); }
{ const r = planInvoice({ total: 1000, paid: 1000, items: [{ amount: 1000, paid_amount: 1000 }] }, [qb('q', 1000, 0)], [pay('p1', 700), pay('p2', 700)], [{ id: 'Q1', date: '2026-10-01', applied: { q: 1000 } }]);
  ok('R10 never links more than the QuickBooks payment applied', r.action === 'EXCEPTION', JSON.stringify(r)); }
ok('R11 item pairing by amount', pairItems([{ amount: 5, paid_amount: 0 }, { amount: 9, paid_amount: 0 }], [qb('x', 9, 9), qb('y', 5, 5)])?.map(p => p.qb.id).join() === 'y,x');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

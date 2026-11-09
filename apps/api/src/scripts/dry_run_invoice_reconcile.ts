/**
 * Dry run of the invoice-level reconcile against local dumps (scratch/zanaco_fix/qb_live): Payment.json, Invoice.json (live QuickBooks, read-only) and
 * mw_*.json (MoneyWise). Writes plan_reconcile.json + plan_reconcile.csv. Changes nothing anywhere.
 */
import * as fs from 'fs';
import { planInvoice, RcPlan } from '../services/masterfees_qb/invoice_reconcile';
const D = process.argv[2] || '/Users/kim_life/Documents/MoneyWise-Pro/scratch/zanaco_fix/qb_live/';
const L = (f: string) => JSON.parse(fs.readFileSync(D + f, 'utf8'));
const QP: any[] = L('Payment.json'), QI: any[] = L('Invoice.json'), MP: any[] = L('mw_payments.json'), MI: any[] = L('mw_invoices.json'), CB: any[] = L('mw_cashbook.json'), AUD: any[] = L('mw_qb_payments.json');
const cb = new Map(CB.map(c => [c.id, c])); const qi = new Map(QI.map(i => [i.Id, i])); const inv = new Map(MI.map(i => [i.mf_id, i]));
const applied = (p: any) => { const o: Record<string, number> = {}; for (const l of p.Line || []) for (const t of l.LinkedTxn || []) if (t.TxnType === 'Invoice') o[t.TxnId] = (o[t.TxnId] || 0) + Number(l.Amount || 0); return o; };
// A QuickBooks payment can cover several MoneyWise entries (one guardian payment for 3 monthly pieces, a bank deposit shared by siblings), so "claimed" is not
// all-or-nothing: what matters is how much of each payment's application to each invoice is still unused after the entries already stamped against it.
const cap = new Map<string, number>();   // `${qbPaymentId}|${qbInvoiceId}` -> cents still free
for (const p of QP) for (const [i, a] of Object.entries(applied(p))) cap.set(`${p.Id}|${i}`, Math.round(a * 100));
const entryInvoices = new Map<string, string[]>();
for (const r of MP) { const rec = inv.get(r.mf_invoice_id); if (r.cashbook_entry_id && rec) entryInvoices.set(r.cashbook_entry_id, String(rec.qb_invoice_id || '').split(',').map((x: string) => x.trim()).filter(Boolean)); }
const consume = (entryId: string, qbPaymentId: string) => {
    const e = cb.get(entryId); if (!e) return; let left = Math.round(Number(e.debit || 0) * 100);
    for (const i of entryInvoices.get(entryId) || []) { const k = `${qbPaymentId}|${i}`; const c = cap.get(k) || 0; const t = Math.min(c, left); if (t > 0) { cap.set(k, c - t); left -= t; } }
};
const seenEntry = new Set<string>();
for (const c of CB) { const q = String(c.qb_deposit_id || ''); if (q.startsWith('PMT:')) { seenEntry.add(c.id); for (const x of q.slice(4).split(';')) if (x) consume(c.id, x); } }
for (const a of AUD) if (!seenEntry.has(a.cashbook_entry_id)) for (const x of String(a.qb_payment_id).split(';')) if (x) consume(a.cashbook_entry_id, x);
const paysByInv = new Map<string, any[]>();
for (const p of QP) { const a = applied(p); const left: Record<string, number> = {}; for (const i of Object.keys(a)) { const c = cap.get(`${p.Id}|${i}`) || 0; if (c > 0) left[i] = c / 100; }
    if (!Object.keys(left).length) continue; for (const i of Object.keys(left)) { if (!paysByInv.has(i)) paysByInv.set(i, []); paysByInv.get(i)!.push({ id: String(p.Id), date: p.TxnDate, applied: left }); } }
const unposted = MP.filter(p => cb.get(p.cashbook_entry_id) && !cb.get(p.cashbook_entry_id).qb_deposit_id && Number(p.raw?.amount) > 0);
const byInv = new Map<string, any[]>(); for (const p of unposted) { const k = p.mf_invoice_id || '(none)'; if (!byInv.has(k)) byInv.set(k, []); byInv.get(k)!.push(p); }
const out: any[] = []; const tally: Record<string, { inv: number; pay: number; amt: number }> = {};
const add = (k: string, n: number, a: number) => { (tally[k] ||= { inv: 0, pay: 0, amt: 0 }); tally[k].inv++; tally[k].pay += n; tally[k].amt += a; };
for (const [mfId, ps] of byInv) {
    const amt = ps.reduce((s, p) => s + Number(p.raw.amount), 0);
    const rec = inv.get(mfId);
    const row = (plan: RcPlan | null, label: string) => out.push({ mf: mfId, student: rec?.raw?.student?.full_name || ps[0].raw?.student?.full_name, term: rec?.raw?.term, payments: ps.map(p => p.raw.reference), amount: amt, channel: [...new Set(ps.map(p => cb.get(p.cashbook_entry_id)?.mf_payment_channel))].join('/'), action: label, reason: plan?.reason, delta: plan?.delta, plan });
    if (mfId === '(none)' || !rec) { row(null, 'NO MF INVOICE'); add('no invoice at Master Fees', ps.length, amt); continue; }
    const ids = String(rec.qb_invoice_id || '').split(',').map((s: string) => s.trim()).filter((s: string) => qi.has(s));
    if (!ids.length) { row(null, 'WAITING: invoice not in QuickBooks'); add('waiting: invoice not in QuickBooks', ps.length, amt); continue; }
    const qbs = ids.map((i: string) => qi.get(i)); const free: any[] = []; const seen = new Set<string>();
    for (const i of ids) for (const p of paysByInv.get(i) || []) if (!seen.has(p.id)) { seen.add(p.id); free.push(p); }
    const plan = planInvoice({ total: Number(rec.raw.total_amount), paid: Number(rec.raw.paid_amount || 0), items: (rec.raw.items || []).filter((i: any) => Number(i.amount) > 0).map((i: any) => ({ amount: Number(i.amount), paid_amount: Number(i.paid_amount || 0), description: i.description })) },
        qbs.map((q: any) => ({ id: q.Id, total: Number(q.TotalAmt), balance: Number(q.Balance), date: q.TxnDate })), ps.map(p => ({ id: p.cashbook_entry_id, amount: Number(p.raw.amount), date: String(p.raw.completed_at).slice(0, 10) })), free);
    row(plan, plan.action); add(plan.action === 'EXCEPTION' ? 'exception: ' + plan.reason.replace(/[\d.,]+/g, 'n').slice(0, 70) : plan.action, ps.length, amt);
}
fs.writeFileSync(D + 'plan_reconcile.json', JSON.stringify(out));
const csv = ['action,student,term,amount,payments,channel,delta,reason', ...out.map(o => [o.action, o.student, o.term, o.amount.toFixed(2), o.payments.join(' '), o.channel, o.delta ?? '', o.reason ?? ''].map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
fs.writeFileSync(D + 'plan_reconcile.csv', csv);
process.stdout.write(`DRY unposted payments ${unposted.length}, invoices ${byInv.size}\n`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1].pay - a[1].pay)) process.stdout.write(`DRY ${String(v.pay).padStart(4)} payments K${Math.round(v.amt).toLocaleString().padStart(8)} on ${String(v.inv).padStart(3)} invoices  ${k}\n`);
const posts = out.filter(o => o.action === 'POST'); process.stdout.write(`DRY POST: ${posts.reduce((s, o) => s + o.plan.posts.length, 0)} QuickBooks payments, K${Math.round(posts.reduce((s, o) => s + o.amount, 0))}; LINK: ${out.filter(o => o.action === 'LINK').reduce((s, o) => s + o.plan.links.length, 0)} links\n`);

/**
 * Invoice-level reconciliation of Master Fees payments against QuickBooks.
 *
 * Basis (owner, 2026-11-09): Master Fees and MoneyWise already say how each payment was treated — every invoice carries `paid_amount`, and so does every fee item.
 * QuickBooks is compared against THAT, one invoice at a time, instead of guessing from names/dates whether a payment "might already be there":
 *
 *   delta = Master Fees paid − QuickBooks paid (summed over the invoice's linked QuickBooks invoices)
 *   delta ≈ 0                      QuickBooks already has the money      → LINK the unposted payments to the existing QuickBooks payments, post nothing
 *   0 < delta ≤ unposted amount    QuickBooks is short by that amount    → POST the shortfall, spread over the fee items exactly as Master Fees allocated it
 *   delta < 0                      QuickBooks shows MORE than Master Fees → EXCEPTION for the bookkeeper (never touched)
 *   anything else (totals differ, delta between 0 and the unposted amount's parts, nothing to link to) → EXCEPTION with the reason
 *
 * Pure functions: no I/O, so the same rules drive the dry run, the tests and (later) the poster.
 */

export interface RcItem { amount: number; paid_amount: number; description?: string }
export interface RcQbInvoice { id: string; total: number; balance: number; date: string }
export interface RcQbPayment { id: string; date: string; applied: Record<string, number> }   // applied: qb invoice id -> amount of this payment applied to it (unclaimed payments only)
export interface RcPayment { id: string; amount: number; date: string }

export type RcAction = 'LINK' | 'POST' | 'EXCEPTION';
export interface RcPlan {
    action: RcAction;
    reason: string;
    delta: number;
    links?: Array<{ paymentId: string; qbPaymentIds: string[]; qbInvoiceIds: string[] }>;
    posts?: Array<{ paymentId: string; lines: Array<{ invoiceId: string; amount: number }> }>;
}

const c = (n: number) => Math.round(n * 100);
const TOL = 50;   // K0.50: rounding noise between Master Fees (decimal) and QuickBooks

/** Which QuickBooks invoice carries which Master Fees fee item. Pairs by amount (items first matched to an unused QuickBooks invoice of the same total). */
export function pairItems(items: RcItem[], qb: RcQbInvoice[]): Array<{ item: RcItem; qb: RcQbInvoice }> | null {
    if (items.length !== qb.length) return null;
    const used = new Set<string>(); const out: Array<{ item: RcItem; qb: RcQbInvoice }> = [];
    for (const it of items) {
        const hit = qb.find(q => !used.has(q.id) && Math.abs(c(q.total) - c(it.amount)) <= TOL);
        if (!hit) return null; used.add(hit.id); out.push({ item: it, qb: hit });
    }
    return out;
}

export function planInvoice(
    mf: { total: number; paid: number; items: RcItem[] },
    qb: RcQbInvoice[],
    unposted: RcPayment[],
    freeQbPayments: RcQbPayment[],
): RcPlan {
    const qbTotal = qb.reduce((s, q) => s + q.total, 0), qbPaid = qb.reduce((s, q) => s + (q.total - q.balance), 0);
    const delta = (c(mf.paid) - c(qbPaid)) / 100, unpostedSum = unposted.reduce((s, p) => s + p.amount, 0);
    if (!qb.length) return { action: 'EXCEPTION', reason: 'Invoice is not in QuickBooks', delta };
    if (Math.abs(c(qbTotal) - c(mf.total)) > TOL) return { action: 'EXCEPTION', reason: `Invoice totals differ (Master Fees ${mf.total.toFixed(2)}, QuickBooks ${qbTotal.toFixed(2)})`, delta };
    if (c(delta) < -TOL) return { action: 'EXCEPTION', reason: `QuickBooks shows ${(-delta).toFixed(2)} MORE paid than Master Fees`, delta };

    // ---- already in QuickBooks: link
    if (Math.abs(c(delta)) <= TOL) {
        const qbIds = new Set(qb.map(q => q.id)); const free = freeQbPayments.map(p => ({ ...p, left: { ...p.applied } }));
        const links: NonNullable<RcPlan['links']> = [];
        for (const pay of [...unposted].sort((a, b) => a.date.localeCompare(b.date))) {
            let need = c(pay.amount); const used: string[] = []; const invs = new Set<string>();
            // prefer one QuickBooks payment that covers it exactly, nearest in date; else several
            const cands = free.map(p => ({ p, cap: Object.entries(p.left).filter(([i]) => qbIds.has(i)).reduce((s, [, a]) => s + c(a), 0) })).filter(x => x.cap > 0)
                .sort((a, b) => (Math.abs(a.cap - need) - Math.abs(b.cap - need)) || (Math.abs(Date.parse(a.p.date) - Date.parse(pay.date)) - Math.abs(Date.parse(b.p.date) - Date.parse(pay.date))));
            for (const { p } of cands) {
                if (need <= 0) break;
                for (const [i, a] of Object.entries(p.left)) { if (!qbIds.has(i) || need <= 0) continue; const take = Math.min(c(a), need); if (take <= 0) continue; p.left[i] = (c(a) - take) / 100; need -= take; invs.add(i); if (!used.includes(p.id)) used.push(p.id); }
            }
            if (need > TOL) return { action: 'EXCEPTION', reason: `QuickBooks shows the invoice paid, but there is no unclaimed QuickBooks payment to link ${pay.amount.toFixed(2)} to (paid by journal/credit, or already linked elsewhere)`, delta };
            links.push({ paymentId: pay.id, qbPaymentIds: used, qbInvoiceIds: [...invs] });
        }
        return { action: 'LINK', reason: 'QuickBooks already shows this invoice paid by the amount Master Fees records', delta, links };
    }

    // ---- QuickBooks short: post exactly the shortfall, and only if the unposted payments are what is missing
    if (c(delta) > c(unpostedSum) + TOL) return { action: 'EXCEPTION', reason: `QuickBooks is short by ${delta.toFixed(2)} but only ${unpostedSum.toFixed(2)} is unposted`, delta };
    if (c(delta) < c(unpostedSum) - TOL) return { action: 'EXCEPTION', reason: `Only ${delta.toFixed(2)} of the ${unpostedSum.toFixed(2)} unposted is missing from QuickBooks — part of it is already there`, delta };

    // where the shortfall sits: per fee item when Master Fees allocation and QuickBooks pair up, otherwise oldest QuickBooks invoice first
    const pairs = pairItems(mf.items, qb); const itemPaid = mf.items.reduce((s, i) => s + i.paid_amount, 0);
    let slots: Array<{ id: string; short: number; date: string }>;
    if (pairs && Math.abs(c(itemPaid) - c(mf.paid)) <= TOL) slots = pairs.map(p => ({ id: p.qb.id, short: c(p.item.paid_amount) - c(p.qb.total - p.qb.balance), date: p.qb.date }));
    else slots = qb.map(q => ({ id: q.id, short: c(q.balance), date: q.date }));
    slots = slots.filter(s => s.short > 0).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    // never apply more than a QuickBooks invoice still owes
    const open = new Map(qb.map(q => [q.id, c(q.balance)])); for (const s of slots) s.short = Math.min(s.short, open.get(s.id) ?? 0);
    if (slots.reduce((s, x) => s + x.short, 0) + TOL < c(unpostedSum)) return { action: 'EXCEPTION', reason: 'The invoices\' open balances do not cover the unposted payments', delta };
    const posts: NonNullable<RcPlan['posts']> = [];
    for (const pay of [...unposted].sort((a, b) => a.date.localeCompare(b.date))) {
        let need = c(pay.amount); const lines: Array<{ invoiceId: string; amount: number }> = [];
        for (const s of slots) { if (need <= 0) break; if (s.short <= 0) continue; const take = Math.min(s.short, need); s.short -= take; need -= take; lines.push({ invoiceId: s.id, amount: take / 100 }); }
        if (need > TOL) return { action: 'EXCEPTION', reason: 'Could not place the whole payment on the fee items that are still unpaid in QuickBooks', delta };
        posts.push({ paymentId: pay.id, lines });
    }
    return { action: 'POST', reason: pairs ? 'QuickBooks is short; payment applied to the fee items as Master Fees allocated it' : 'QuickBooks is short; payment applied oldest invoice first', delta, posts };
}

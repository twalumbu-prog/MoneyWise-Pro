/**
 * Which payments the QuickBooks poster may post.
 *
 * Principle (owner, 2026-11-06): QuickBooks must agree with Master Fees, and the payments in it must reconcile with the bank statements.
 *  1. Scope follows Master Fees. A payment is in scope when it was completed on/after the start date (`from`), OR when its invoice falls in the creation window
 *     (`createFrom` onward): those invoices are created in QuickBooks by the poster, so their payments (even from before `from`) must be posted too, or the invoice would
 *     show as unpaid in QuickBooks while Master Fees shows it paid.
 *  2. Bank reconciliation. On a wallet whose bank statement has been imported, a payment must be matched to a statement line before it is posted. A payment dated after the
 *     statement ends cannot be checked yet and is allowed; a wallet with no statement imported is not held (there is nothing to reconcile against).
 */

export function paymentInScope(completedAt: string | null | undefined, invoiceDay: string | null | undefined, from: string, createFrom?: string | null): boolean {
    const c = String(completedAt || '').slice(0, 10);
    if (c && c >= from) return true;
    return !!createFrom && !!invoiceDay && String(invoiceDay).slice(0, 10) >= createFrom;
}

/** Why a payment must be held back from QuickBooks until it reconciles with the bank, or null when it may go. */
export function bankReconciliationHold(
    e: { accountType: string | null | undefined; date: string; linked: boolean },
    latestStatementDayByWallet: Map<string, string>,
): string | null {
    const latest = e.accountType ? latestStatementDayByWallet.get(e.accountType) : undefined;
    if (!latest || e.linked) return null;
    if (String(e.date).slice(0, 10) > latest) return null;
    return `Not matched to a line on the bank statement (the statement covers up to ${latest}) — held until it reconciles`;
}

/**
 * A single Master Fees fee billed TERMLY can sit in QuickBooks as several MONTHLY invoices (K855 = 3 x K285). The payment is then spread over those pieces, oldest
 * first, each taking at most its open balance. Returns null when the pieces together do not have enough open balance for the payment (a person must look), so a
 * payment is never applied beyond what the invoices still owe.
 */
export function allocateAcrossPieces(amount: number, pieces: Array<{ id: string; balance: number; date: string }>): Array<{ invoiceId: string; amount: number }> | null {
    let left = Math.round(amount * 100);
    const lines: Array<{ invoiceId: string; amount: number }> = [];
    for (const p of [...pieces].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)))) {
        const open = Math.round(p.balance * 100); if (open <= 0 || left <= 0) continue;
        const take = Math.min(open, left); lines.push({ invoiceId: p.id, amount: take / 100 }); left -= take;
    }
    return left === 0 && lines.length ? lines : null;
}

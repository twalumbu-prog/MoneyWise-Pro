/**
 * Resolving which QuickBooks invoice a Master Fees payment actually paid.
 *
 * The first version of this matched on customer + amount alone, which is
 * unsound: school fees recur at identical amounts every term, and lunch fees
 * recur at K35 every single day. That reliably attached Term 3 payments to
 * Term 2 invoices and Monday's lunch to the previous Monday's.
 *
 * Priority order here:
 *   1. MF invoice number quoted in the QuickBooks invoice's PrivateNote. The
 *      school's own Term 2 reconciliation established this convention
 *      ("MoneyWise/MasterFees Term 2 reconciliation. Ref: INV-AUTO-..."), and
 *      it is the only definitive key that exists.
 *   2. Fee description + amount within the matched customer. The description
 *      ("Grade 6 Tuition - Term 3", "Standard Lunch Meal - Mon 18th") is what
 *      distinguishes one term or one day from another.
 * Amount alone is never sufficient and is not a tier here.
 */

export interface QbInvoiceLike {
    id: string;
    docNumber: string;
    date: string;
    customerId: string;
    customerName: string;
    privateNote: string;
    memo: string;
    totalAmt: number;
    balance: number;
    lines: Array<{ amount: number; itemName: string; description: string }>;
}

/** Normalise a fee description: drop ordinal suffixes and punctuation. */
export function normDesc(s: string | null | undefined): string {
    return (s || '')
        .toUpperCase()
        .replace(/(\d+)(ST|ND|RD|TH)\b/g, '$1')
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Every Master Fees invoice identifier cited in a QuickBooks invoice's
 * PrivateNote. Two shapes exist in this data: a human-readable number
 * ("INV-AUTO-1785413412821-446", found anywhere in the note) and, for older
 * invoices that never got a real number assigned, the raw Master Fees
 * invoice UUID itself, which only appears after "Ref:" — a bare UUID
 * anywhere else in free text would be too easy to false-match.
 */
export function mfNumbersInNote(note: string | null | undefined): string[] {
    const out = new Set<string>();
    for (const m of (note || '').match(/INV-[A-Z0-9-]+/gi) || []) out.add(m.toUpperCase());
    const refMatch = (note || '').match(/Ref:\s*(\S+)/i);
    if (refMatch && refMatch[1] && refMatch[1].toLowerCase() !== 'n/a') {
        out.add(refMatch[1].replace(/[.,;]+$/, '').toUpperCase());
    }
    return [...out];
}

export function buildMfNumberIndex(invoices: QbInvoiceLike[]): Map<string, QbInvoiceLike[]> {
    const idx = new Map<string, QbInvoiceLike[]>();
    for (const q of invoices) {
        for (const num of mfNumbersInNote(q.privateNote)) {
            const key = num.toUpperCase();
            if (!idx.has(key)) idx.set(key, []);
            idx.get(key)!.push(q);
        }
    }
    return idx;
}

export type LinkTier = 'IMP_DOCNUM' | 'MF_NUMBER' | 'DESCRIPTION' | 'TERM_AMOUNT' | 'NONE';

export interface LinkResult {
    tier: LinkTier;
    invoice?: QbInvoiceLike;
    detail: string;
}

/**
 * The academic term a QuickBooks invoice refers to, read from its line
 * descriptions ("TERM 1", "Grade 6 Tuition - Term 3") or its reconciliation
 * memo ("MoneyWise/MasterFees Term 2 reconciliation"). Null when it says
 * nothing about a term — about half of them.
 */
export function qbTermOf(inv: QbInvoiceLike): number | null {
    const text = (inv.lines.map(l => l.description).join(' ') + ' ' + (inv.privateNote || '') + ' ' + (inv.memo || '')).toUpperCase();
    const m = text.match(/TERM\s*([123])\b/);
    return m ? Number(m[1]) : null;
}

/**
 * Master Fees "IMP-<n>-R<n>" transaction references embed the QuickBooks
 * DocNumber of the invoice they were imported from — `IMP-34655-R349` means
 * QuickBooks invoice DocNumber 34655. This is the single most reliable key
 * available (1,556 invoices, 97.6% amount-verified) and it exists for
 * historical/imported fees that carry no PrivateNote linkage at all.
 *
 * Returns MF invoice_id -> QuickBooks DocNumber.
 */
export function buildImpDocIndex(transactions: Array<{ reference?: string; invoice_id?: string }>): Map<string, string> {
    const idx = new Map<string, string>();
    for (const t of transactions) {
        const m = (t.reference || '').match(/^IMP-(\d+)/);
        if (m && t.invoice_id) idx.set(t.invoice_id, m[1]);
    }
    return idx;
}

/**
 * Find the QuickBooks invoice corresponding to one Master Fees fee item.
 *
 * @param mfInvoiceNumber  invoice_number from Master Fees (may be blank)
 * @param itemDescription  the fee line description, e.g. "Grade 6 Tuition - Term 3"
 * @param itemAmount       the fee line amount
 * @param customerInvoices every QuickBooks invoice belonging to the matched student
 * @param mfNumberIndex    output of buildMfNumberIndex over ALL invoices
 * @param claimed          invoice ids already consumed by another payment
 */
export function findQbInvoiceForItem(
    mfInvoiceNumber: string,
    itemDescription: string,
    itemAmount: number,
    customerInvoices: QbInvoiceLike[],
    mfNumberIndex: Map<string, QbInvoiceLike[]>,
    claimed: Set<string>,
    opts: { mfTerm?: number | null; impDocNumber?: string | null; qbByDoc?: Map<string, QbInvoiceLike> } = {},
): LinkResult {
    // ---- Tier 0: the Master Fees invoice number/ID, quoted in PrivateNote ----
    // An invoice explicitly tagged "Ref: <this exact MF invoice>" was created
    // deliberately for this obligation — the strongest evidence available.
    // Checked before IMP_DOCNUM: three cases (the Nkonde siblings) showed the
    // docnumber pointing to a DIFFERENT invoice that happened to be settled
    // independently (a bulk "3+ children discount" payment), while the real
    // dedicated reconciliation invoice for this exact fee sat unpaid — IMP
    // wins only when no explicit reference invoice exists at all.
    const num = (mfInvoiceNumber || '').trim().toUpperCase();
    if (num) {
        const linked = (mfNumberIndex.get(num) || []).filter(q => !claimed.has(q.id));
        if (linked.length > 0) {
            // Where that MF invoice produced several QB invoices (one per fee
            // line), pick the one whose amount matches this line.
            const byAmount = linked.filter(q => Math.abs(q.totalAmt - itemAmount) < 0.01);
            const pick = byAmount[0] || (linked.length === 1 ? linked[0] : undefined);
            if (pick) {
                return { tier: 'MF_NUMBER', invoice: pick, detail: `Linked by Master Fees invoice number ${num} recorded in the QuickBooks PrivateNote.` };
            }
        }
    }

    // ---- Tier 1: the QuickBooks DocNumber embedded in an IMP- reference ----
    // Verified against the customer so a stray docnumber can never pull in
    // another student's invoice. Fallback only — see note above.
    if (opts.impDocNumber && opts.qbByDoc) {
        const q = opts.qbByDoc.get(opts.impDocNumber);
        if (q && !claimed.has(q.id) && customerInvoices.some(c => c.id === q.id)) {
            return { tier: 'IMP_DOCNUM', invoice: q, detail: `Linked by the QuickBooks document number ${opts.impDocNumber} embedded in the Master Fees import reference (IMP-${opts.impDocNumber}-...).` };
        }
    }

    // Candidates are always constrained to this student and this exact amount.
    // Where both sides state a term, a differing term disqualifies outright —
    // that is precisely what stops Term 3 money landing on a Term 2 invoice.
    const sameAmount = customerInvoices.filter(q => Math.abs(q.totalAmt - itemAmount) < 0.01 && !claimed.has(q.id));
    const termCompatible = sameAmount.filter(q => {
        const qt = qbTermOf(q);
        if (opts.mfTerm == null || qt == null) return true;
        return qt === opts.mfTerm;
    });

    // ---- Tier 2: fee description + amount, within this student and term ----
    const target = normDesc(itemDescription);
    if (target) {
        const exactDesc = termCompatible.filter(q => q.lines.some(l => normDesc(l.description) === target));
        if (exactDesc.length > 0) {
            return { tier: 'DESCRIPTION', invoice: exactDesc[0], detail: `Matched on identical fee description "${itemDescription}" at K${itemAmount.toFixed(2)}${opts.mfTerm ? ` (term ${opts.mfTerm})` : ''}.` };
        }
        const partial = termCompatible.filter(q => q.lines.some(l => {
            const d = normDesc(l.description);
            return d.length >= 6 && target.length >= 6 && (d.includes(target) || target.includes(d));
        }));
        if (partial.length === 1) {
            return { tier: 'DESCRIPTION', invoice: partial[0], detail: `Matched on overlapping fee description "${itemDescription}" at K${itemAmount.toFixed(2)} (single candidate).` };
        }
    }

    // ---- Tier 3: term + amount, when the wording simply differs ----
    // Master Fees says "Tuition"; QuickBooks says "TERM 1". No description
    // rule can bridge that, but term + amount + student pins it down — as long
    // as exactly one candidate qualifies, so a shared amount across two terms
    // can never be guessed at.
    if (opts.mfTerm != null) {
        const termExplicit = termCompatible.filter(q => qbTermOf(q) === opts.mfTerm);
        if (termExplicit.length === 1) {
            const q = termExplicit[0];
            return { tier: 'TERM_AMOUNT', invoice: q, detail: `Matched on term ${opts.mfTerm} + amount K${itemAmount.toFixed(2)} for this student — Master Fees calls it "${itemDescription}", QuickBooks calls it "${q.lines.map(l => l.description).join(' / ')}".` };
        }
    }

    return { tier: 'NONE', detail: `No QuickBooks invoice for "${itemDescription}" (K${itemAmount.toFixed(2)}${opts.mfTerm ? `, term ${opts.mfTerm}` : ''}) — no import-reference link, no invoice-number link, and no description or term match among this student's invoices at that amount. Likely never created in QuickBooks.` };
}

/**
 * Before the poster CREATES a QuickBooks invoice for a Master Fees fee, it checks whether QuickBooks may already hold that same charge (so it never double-bills).
 *
 * Owner's principle (2026-11-09): a child has ONE tuition invoice per term (three terms a year; fewer if they joined or left mid-year); transport is billed
 * termly or monthly; canteen is billed per day/week. "QuickBooks already has an invoice of this kind around then" is only evidence of the same charge when
 * it is for the SAME school year and term, and is not already the QuickBooks side of a DIFFERENT Master Fees invoice.
 *
 * The old guard looked only at "same fee family within -14..+60 days", so on Twalumbu (Nov 2026) it refused 16 daily lunches because QuickBooks had the
 * child's lunches for other days, and 5 transport fees because of a neighbouring term's invoices.
 */
import { qbTermOf, qbSchoolYearOf, QbInvoiceLike } from './mf_qb_link';

const dayNum = (d: string) => Math.floor(new Date(String(d).slice(0, 10) + 'T00:00:00Z').getTime() / 86400000);
const near = (qDate: string, ref: string) => { const x = dayNum(qDate) - dayNum(ref); return x >= -14 && x <= 60; };
const normDesc = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** School term implied by a date: December = Term 1 of next year, Jan–Apr = 1, May–Aug = 2, Sep–Nov = 3. */
export function termOfDate(d: string): { year: number; term: number } | null {
    const m = String(d || '').match(/^(\d{4})-(\d{2})/); if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]);
    if (mo === 12) return { year: y + 1, term: 1 };
    return { year: y, term: mo <= 4 ? 1 : mo <= 8 ? 2 : 3 };
}

export interface FeeToCreate {
    family: string;            // tuition / transport / canteen / uniform / other (the poster's famOf)
    description: string;
    issued: string;            // date_issued || due_date
    due: string;
    term: number | null;       // Master Fees term label
    year: number | null;       // Master Fees year label
}

/** QuickBooks invoices that may already be this charge. Empty = safe to create. */
export function possibleSameCharge(
    fee: FeeToCreate,
    customerInvoices: QbInvoiceLike[],
    familyOf: (text: string) => string,
    claimedByOtherMfInvoice: Set<string>,
    createdByMoneyWiseNote: string,
): QbInvoiceLike[] {
    const mfDateTerm = termOfDate(fee.issued);
    return customerInvoices.filter(q => {
        if ((q.privateNote || '').includes(createdByMoneyWiseNote)) return false;           // MoneyWise's own invoices are linked by reference, never guessed
        if (claimedByOtherMfInvoice.has(q.id)) return false;                                  // already the QuickBooks side of another Master Fees charge
        if (!q.lines.some(l => familyOf(`${l.itemName} ${l.description}`) === fee.family)) return false;
        if (!(near(q.date, fee.issued) || near(q.date, fee.due))) return false;
        // same school year
        const qy = qbSchoolYearOf(q); if (fee.year != null && qy != null && qy !== fee.year) return false;
        // same term: an explicit "Term n" on the QuickBooks invoice decides; otherwise its date's term must match the Master Fees term label or the
        // term of the Master Fees issue date (Master Fees labels and dates sometimes disagree, so either is accepted — the cautious choice)
        const qt = qbTermOf(q);
        if (qt != null) { if (fee.term != null && qt !== fee.term) return false; }
        else {
            const qd = termOfDate(q.date);
            if (qd && fee.term != null && qd.term !== fee.term && !(mfDateTerm && mfDateTerm.term === qd.term && mfDateTerm.year === qd.year)) return false;
        }
        // canteen is charged per day/week: only the same day or the same wording is the same charge
        if (fee.family === 'canteen') {
            const sameDay = String(q.date).slice(0, 10) === String(fee.issued).slice(0, 10);
            const sameText = q.lines.some(l => normDesc(l.description) === normDesc(fee.description) && normDesc(fee.description).length > 0);
            if (!sameDay && !sameText) return false;
        }
        return true;
    });
}

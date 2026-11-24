/**
 * Budget periods, carry-forward and report proration — one place, shared by the Budgets screen and both
 * Reporting screens, so what you set is exactly what the reports measure against.
 *
 * Model (rows live in the `budgets` table, one per account per period):
 *  - Each line item (account) has ONE basis: MONTHLY, QUARTERLY or YEARLY (WEEKLY rows written by older web
 *    builds are still understood). The basis is the period_type of the account's most recently saved
 *    row, so changing the basis is just saving a row of the new type.
 *  - Carry-forward: a period with no row of its own uses the latest earlier row of the same basis. Set K500 in
 *    March and April–December show K500 too until you change one of them, which then carries on from there.
 *    A saved 0 means "no budget from here on".
 *  - Reports over any date range get each account's budget prorated by the days of each budget period that the
 *    range covers (a monthly report on a quarterly budget gets that month's share of the quarter).
 */
import type { Budget } from '../services/budget.service';

export type BudgetBasis = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
/** The bases the Budgets screen offers. */
export const BUDGET_BASES: { value: BudgetBasis; label: string }[] = [
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'YEARLY', label: 'Yearly' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const short = (m: number) => MONTHS[m].slice(0, 3);

export interface BudgetPeriod {
    basis: BudgetBasis;
    /** Inclusive ISO dates (YYYY-MM-DD). */
    start: string;
    end: string;
    /** "November 2026", "Q4 2026", "2026" … */
    label: string;
    /** "Oct – Dec" for quarters, "Jan – Dec" for years, empty for months. */
    span: string;
}

// All maths in UTC on date-only values, so the device time zone can never shift a day.
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const DAY = 86_400_000;
const days = (start: string, end: string) => Math.round((parse(end).getTime() - parse(start).getTime()) / DAY) + 1;

export function isoToday(): string {
    const n = new Date();
    return iso(utc(n.getFullYear(), n.getMonth(), n.getDate()));
}

/** The budget period of `basis` that contains `date`. */
export function periodContaining(basis: BudgetBasis, date: string): BudgetPeriod {
    const d = parse(date);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (basis === 'WEEKLY') {
        const back = (d.getUTCDay() + 6) % 7; // weeks start on Monday
        const s = new Date(d.getTime() - back * DAY), e = new Date(s.getTime() + 6 * DAY);
        return { basis, start: iso(s), end: iso(e), label: `Week of ${s.getUTCDate()} ${short(s.getUTCMonth())} ${s.getUTCFullYear()}`, span: '' };
    }
    if (basis === 'QUARTERLY') {
        const q = Math.floor(m / 3);
        return { basis, start: iso(utc(y, q * 3, 1)), end: iso(utc(y, q * 3 + 3, 0)), label: `Q${q + 1} ${y}`, span: `${short(q * 3)} – ${short(q * 3 + 2)}` };
    }
    if (basis === 'YEARLY') return { basis, start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}`, span: 'Jan – Dec' };
    return { basis: 'MONTHLY', start: iso(utc(y, m, 1)), end: iso(utc(y, m + 1, 0)), label: `${MONTHS[m]} ${y}`, span: '' };
}

/** The period `n` steps after (or before, if negative) the one containing `date`. */
export function shiftPeriod(basis: BudgetBasis, date: string, n: number): BudgetPeriod {
    const p = periodContaining(basis, date);
    const s = parse(p.start);
    if (basis === 'WEEKLY') return periodContaining(basis, iso(new Date(s.getTime() + n * 7 * DAY)));
    const step = basis === 'QUARTERLY' ? 3 : basis === 'YEARLY' ? 12 : 1;
    return periodContaining(basis, iso(utc(s.getUTCFullYear(), s.getUTCMonth() + n * step, 1)));
}

const stamp = (b: Budget) => b.updated_at || b.created_at || '';

/** An account's basis: the type of its most recently saved row (MONTHLY when it has none). */
export function accountBasis(rows: Budget[], accountId: string): BudgetBasis {
    let best: Budget | null = null;
    for (const b of rows) {
        if (b.qb_account_id !== accountId) continue;
        if (!best || stamp(b) > stamp(best)) best = b;
    }
    return (best?.period_type as BudgetBasis) || 'MONTHLY';
}

export interface EffectiveBudget {
    amount: number;
    /** The row the amount comes from (this period's own row, or the earlier one being carried). */
    source: Budget | null;
    /** True when the amount is carried forward from an earlier period rather than set for this one. */
    carried: boolean;
}

/** What `accountId` is budgeted for the `basis` period starting `periodStart`: its own row, else carried forward. */
export function effectiveBudget(rows: Budget[], accountId: string, basis: BudgetBasis, periodStart: string): EffectiveBudget {
    let best: Budget | null = null;
    for (const b of rows) {
        if (b.qb_account_id !== accountId || b.period_type !== basis) continue;
        const s = b.start_date.slice(0, 10);
        if (s > periodStart) continue;
        if (!best || s > best.start_date.slice(0, 10) || (s === best.start_date.slice(0, 10) && stamp(b) > stamp(best))) best = b;
    }
    if (!best) return { amount: 0, source: null, carried: false };
    return { amount: Number(best.amount) || 0, source: best, carried: best.start_date.slice(0, 10) !== periodStart };
}

const monthsIn = (basis: BudgetBasis) => (basis === 'QUARTERLY' ? 3 : basis === 'YEARLY' ? 12 : 1);
const monthIndex = (isoDate: string) => Number(isoDate.slice(0, 4)) * 12 + Number(isoDate.slice(5, 7)) - 1;

/** The month (0-based within its period) a lump-sum budget is due in, or null when it is spread evenly. */
export function dueOffset(b: Budget | null | undefined): number | null {
    const v = (b as { due_offset?: number | null } | null | undefined)?.due_offset;
    return v === null || v === undefined ? null : Number(v);
}

/**
 * How much of a period's budget falls in the month starting `monthStart`.
 * Spread evenly: the monthly equivalent (amount ÷ months in the period). Paid all at once: the whole amount in the
 * month it is due and nothing in the others, so a month never looks like it owes a whole quarter or year.
 */
export function amountInMonth(amount: number, basis: BudgetBasis, due: number | null, periodStart: string, monthStart: string): number {
    const n = monthsIn(basis);
    if (n === 1 || due === null) return amount / n;
    return monthIndex(monthStart) - monthIndex(periodStart) === due ? amount : 0;
}

/** What `accountId` contributes to the month starting `monthStart` (carry-forward included). */
export function budgetForMonth(rows: Budget[], accountId: string, monthStart: string) {
    const basis = accountBasis(rows, accountId);
    const period = periodContaining(basis, monthStart);
    const eff = effectiveBudget(rows, accountId, basis, period.start);
    const due = dueOffset(eff.source);
    return { basis, period, due, ...eff, thisMonth: eff.amount > 0 ? amountInMonth(eff.amount, basis, due, period.start, monthStart) : 0 };
}

/**
 * One synthetic budget row per account for a report covering [start, end]: month by month, each month's share of
 * its budget (see amountInMonth) × the part of that month inside the range. Feed the result to buildReportGroups in
 * place of raw rows.
 */
export function budgetsForRange(rows: Budget[], start: string, end: string): Budget[] {
    const ids = [...new Set(rows.map((b) => b.qb_account_id))];
    const out: Budget[] = [];
    for (const id of ids) {
        const basis = accountBasis(rows, id);
        let total = 0;
        if (basis === 'WEEKLY') {
            // Older web budgets: prorate each week by days.
            let p = periodContaining(basis, start);
            for (let guard = 0; p.start <= end && guard < 600; guard++) {
                const eff = effectiveBudget(rows, id, basis, p.start);
                const from = p.start > start ? p.start : start, to = p.end < end ? p.end : end;
                if (eff.amount > 0) total += eff.amount * (days(from, to) / days(p.start, p.end));
                p = shiftPeriod(basis, p.start, 1);
            }
        } else {
            let m = periodContaining('MONTHLY', start);
            for (let guard = 0; m.start <= end && guard < 600; guard++) {
                const share = budgetForMonth(rows, id, m.start).thisMonth;
                const from = m.start > start ? m.start : start, to = m.end < end ? m.end : end;
                if (share > 0) total += share * (days(from, to) / days(m.start, m.end));
                m = shiftPeriod('MONTHLY', m.start, 1);
            }
        }
        if (total <= 0) continue;
        const any = rows.find((b) => b.qb_account_id === id)!;
        out.push({ ...any, amount: Math.round(total * 100) / 100, period_type: basis, start_date: start, end_date: end });
    }
    return out;
}

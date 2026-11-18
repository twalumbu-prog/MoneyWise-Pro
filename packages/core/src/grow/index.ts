/**
 * Grow — a person's net-worth plan.
 *
 * The person sets four recurring targets (income, expenses, savings, investing), each in whatever
 * rhythm they think in (daily, weekly, monthly…), plus a goal date. Grow turns that into a month-by-month
 * net-worth trajectory and then grades each month against what actually happened in the books.
 *
 * Everything in here is pure: no fetching, no storage. The app supplies the actuals per month.
 *
 * Money model (per month m):
 *   cash grows by       income − expenses − invested
 *   invested pot grows  pot × monthlyReturn + invested
 *   net worth           = start + cash + pot (+ catch-up, when a stretch goal is above what the plan reaches)
 * Savings are part of the surplus that stays as cash, so they don't change the trajectory — they are a
 * target for *where* the surplus goes, graded on its own.
 */

export type GrowFrequency = 'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
/** Ordered by how often people think in them — monthly first. */
export const GROW_FREQUENCIES: GrowFrequency[] = ['MONTHLY', 'WEEKLY', 'FORTNIGHTLY', 'DAILY', 'QUARTERLY', 'YEARLY'];
export const GROW_FREQUENCY_LABEL: Record<GrowFrequency, string> = {
    DAILY: 'Daily', WEEKLY: 'Weekly', FORTNIGHTLY: 'Every 2 weeks', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', YEARLY: 'Yearly',
};
/** "per day", "a week"… for inline copy like "K500 a week". */
export const GROW_FREQUENCY_UNIT: Record<GrowFrequency, string> = {
    DAILY: 'a day', WEEKLY: 'a week', FORTNIGHTLY: 'every 2 weeks', MONTHLY: 'a month', QUARTERLY: 'a quarter', YEARLY: 'a year',
};

export type GrowTargetKey = 'income' | 'expense' | 'savings' | 'investment';
export const GROW_TARGET_KEYS: GrowTargetKey[] = ['income', 'expense', 'savings', 'investment'];

export interface GrowTarget { amount: number; frequency: GrowFrequency }

export interface GrowPlan {
    version: 1;
    /** Month 1 of the plan, 'YYYY-MM'. */
    startMonth: string;
    /** Net worth at setup — used as the starting point until the month before startMonth has closed in the books. */
    startNetWorth: number;
    income: GrowTarget;
    expense: GrowTarget;
    savings: GrowTarget;
    investment: GrowTarget;
    /** Expected yearly return on money invested, in percent (e.g. 12 for 12%). */
    annualReturnPct: number;
    /** Last month of the plan, 'YYYY-MM' — the month the goal is due. */
    goalMonth: string;
    /** A stretch net-worth goal. null = "whatever my targets get me to". */
    goalAmount: number | null;
    createdAt: string;
    updatedAt: string;
}

// ── Months ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
export const monthKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export function parseMonthKey(key: string): { y: number; m: number } {
    const [y, m] = key.split('-').map(Number);
    return { y, m: m - 1 };
}
export function addMonths(key: string, n: number): string {
    const { y, m } = parseMonthKey(key);
    return monthKeyOf(new Date(y, m + n, 1));
}
/** Whole months from a to b (b − a). */
export function monthsBetween(a: string, b: string): number {
    const A = parseMonthKey(a), B = parseMonthKey(b);
    return (B.y - A.y) * 12 + (B.m - A.m);
}
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function monthRange(key: string): { start: string; end: string; days: number } {
    const { y, m } = parseMonthKey(key);
    const last = new Date(y, m + 1, 0);
    return { start: isoDate(new Date(y, m, 1)), end: isoDate(last), days: last.getDate() };
}
export function monthName(key: string, style: 'long' | 'short' = 'long'): string {
    const { y, m } = parseMonthKey(key);
    return new Date(y, m, 1).toLocaleDateString('en-US', { month: style });
}
export function monthLabelWithYear(key: string, style: 'long' | 'short' = 'short'): string {
    const { y, m } = parseMonthKey(key);
    return new Date(y, m, 1).toLocaleDateString('en-US', { month: style, year: 'numeric' });
}

// ── Amounts ─────────────────────────────────────────────────────────────────

/** A target in its own rhythm → what it adds up to over one specific calendar month. */
export function amountForMonth(t: GrowTarget, monthKey: string): number {
    const a = Number.isFinite(t.amount) ? Math.max(0, t.amount) : 0;
    switch (t.frequency) {
        case 'DAILY': return a * monthRange(monthKey).days;
        case 'WEEKLY': return (a * 52) / 12;
        case 'FORTNIGHTLY': return (a * 26) / 12;
        case 'MONTHLY': return a;
        case 'QUARTERLY': return a / 3;
        case 'YEARLY': return a / 12;
    }
}
/** A target in its own rhythm → an average month (used for setup-time summaries). */
export function monthlyEquivalent(t: GrowTarget): number {
    if (t.frequency === 'DAILY') return (Math.max(0, t.amount) * 365.25) / 12;
    return amountForMonth(t, '2001-01');
}

// ── Projection ──────────────────────────────────────────────────────────────

export interface GrowMonthPlan {
    key: string;
    /** 1-based: "Month 1". */
    index: number;
    start: string;
    end: string;
    targets: Record<GrowTargetKey, number>;
    /** How much net worth should grow this month. */
    targetGrowth: number;
    /** Planned net worth at the end of this month. */
    targetNetWorth: number;
}

export interface GrowProjection {
    baseline: number;
    months: GrowMonthPlan[];
    /** Where the four targets alone get you by the goal month. */
    naturalEnd: number;
    /** The finish line: the stretch goal if one is set, otherwise naturalEnd. */
    goal: number;
    /** Extra growth per month needed on top of the targets to reach a stretch goal (0 when none). */
    monthlyCatchUp: number;
    /** Planned monthly surplus (income − expenses) for an average month. */
    monthlySurplus: number;
}

export function planLength(plan: Pick<GrowPlan, 'startMonth' | 'goalMonth'>): number {
    return Math.max(1, monthsBetween(plan.startMonth, plan.goalMonth) + 1);
}

/**
 * The plan's month-by-month trajectory. `baseline` is net worth at the start of Month 1.
 */
export function projectGrowPlan(
    plan: Pick<GrowPlan, 'startMonth' | 'goalMonth' | 'income' | 'expense' | 'savings' | 'investment' | 'annualReturnPct' | 'goalAmount'>,
    baseline: number,
): GrowProjection {
    const n = planLength(plan);
    const r = Math.pow(1 + Math.max(0, plan.annualReturnPct || 0) / 100, 1 / 12) - 1;

    const raw: { key: string; targets: Record<GrowTargetKey, number>; growth: number }[] = [];
    let pot = 0;
    for (let i = 0; i < n; i++) {
        const key = addMonths(plan.startMonth, i);
        const targets = {
            income: amountForMonth(plan.income, key),
            expense: amountForMonth(plan.expense, key),
            savings: amountForMonth(plan.savings, key),
            investment: amountForMonth(plan.investment, key),
        };
        const returns = pot * r;
        pot += returns + targets.investment;
        raw.push({ key, targets, growth: targets.income - targets.expense + returns });
    }
    const naturalEnd = baseline + raw.reduce((s, m) => s + m.growth, 0);
    const stretch = plan.goalAmount != null && plan.goalAmount > naturalEnd ? plan.goalAmount : null;
    const monthlyCatchUp = stretch != null ? (stretch - naturalEnd) / n : 0;

    let nw = baseline;
    const months: GrowMonthPlan[] = raw.map((m, i) => {
        const targetGrowth = m.growth + monthlyCatchUp;
        nw += targetGrowth;
        const { start, end } = monthRange(m.key);
        return { key: m.key, index: i + 1, start, end, targets: m.targets, targetGrowth, targetNetWorth: nw };
    });

    return {
        baseline,
        months,
        naturalEnd,
        goal: stretch ?? Math.max(naturalEnd, plan.goalAmount ?? naturalEnd),
        monthlyCatchUp,
        monthlySurplus: monthlyEquivalent(plan.income) - monthlyEquivalent(plan.expense),
    };
}

// ── Grading ─────────────────────────────────────────────────────────────────

export interface GrowMonthActuals {
    income: number;
    expense: number;
    savings: number;
    investment: number;
    /** Net worth at the end of the month (or today, for the current month). */
    netWorth: number;
}

export type GrowTargetStatus = 'met' | 'pending' | 'missed';
export type GrowMonthStatus = 'UPCOMING' | 'IN_PROGRESS' | 'ON_TRACK' | 'OFF_TRACK';

export interface GrowMonthResult {
    plan: GrowMonthPlan;
    actuals: GrowMonthActuals | null;
    status: GrowMonthStatus;
    targetStatus: Record<GrowTargetKey, GrowTargetStatus>;
    /** Net-worth growth so far this month. */
    grown: number;
    /** grown / targetGrowth, 0–1 (clamped). */
    progress: number;
    metCount: number;
}

/**
 * Grade one month. Income, savings and investing are "reach at least"; expenses are "stay under" —
 * so an overspend fails immediately, while staying under only counts once the month is over.
 */
export function gradeMonth(
    month: GrowMonthPlan,
    actuals: GrowMonthActuals | null,
    previousNetWorth: number,
    today: Date = new Date(),
): GrowMonthResult {
    const todayIso = isoDate(today);
    const phase = todayIso < month.start ? 'future' : todayIso > month.end ? 'past' : 'current';

    const targetStatus = {} as Record<GrowTargetKey, GrowTargetStatus>;
    for (const k of GROW_TARGET_KEYS) {
        const target = month.targets[k];
        if (!actuals || phase === 'future') { targetStatus[k] = 'pending'; continue; }
        const actual = actuals[k];
        if (k === 'expense') {
            targetStatus[k] = actual > target + 0.005 ? 'missed' : phase === 'past' ? 'met' : 'pending';
        } else {
            targetStatus[k] = actual + 0.005 >= target ? 'met' : phase === 'past' ? 'missed' : 'pending';
        }
    }

    const grown = actuals ? actuals.netWorth - previousNetWorth : 0;
    const progress = month.targetGrowth > 0 ? Math.max(0, Math.min(1, grown / month.targetGrowth)) : grown >= 0 ? 1 : 0;

    let status: GrowMonthStatus;
    if (phase === 'future' || !actuals) status = phase === 'current' ? 'IN_PROGRESS' : 'UPCOMING';
    else if (phase === 'current') status = 'IN_PROGRESS';
    else status = actuals.netWorth + 0.005 >= month.targetNetWorth ? 'ON_TRACK' : 'OFF_TRACK';

    return {
        plan: month,
        actuals,
        status,
        targetStatus,
        grown,
        progress,
        metCount: GROW_TARGET_KEYS.filter((k) => targetStatus[k] === 'met').length,
    };
}

// ── Classifying the books into the four buckets ─────────────────────────────

/** One reporting row, as /reports/expenditure returns it. */
export interface GrowLedgerRow { account_name: string; type: string; total_amount: number }

const SAVINGS_RE = /sav(e|ing)/i;
const INVEST_RE = /invest|shares?\b|stocks?\b|bonds?\b|unit trust|treasury|t-?bills?|pension|retire|dividend portfolio/i;
const isSavings = (name: string) => SAVINGS_RE.test(name);
const isInvestment = (name: string) => !isSavings(name) && INVEST_RE.test(name);

/**
 * Turn two reporting snapshots (month-to-date rows, and the previous month-end rows for the
 * cumulative balance-sheet accounts) into the four Grow buckets plus net worth.
 *
 * - income:      every INCOME account for the month
 * - expense:     EXPENSE accounts, minus any that are really savings / investing allocations
 * - savings:     growth of savings asset accounts + "savings" allocations booked as expenses
 * - investment:  growth of investment asset accounts + investing allocations booked as expenses
 */
export function summariseGrowMonth(rows: GrowLedgerRow[], previousRows: GrowLedgerRow[] | null): GrowMonthActuals {
    const sum = (list: GrowLedgerRow[], pred: (r: GrowLedgerRow) => boolean) =>
        list.filter(pred).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);

    const income = sum(rows, (r) => r.type === 'INCOME');
    const savingsExp = sum(rows, (r) => r.type === 'EXPENSE' && isSavings(r.account_name));
    const investExp = sum(rows, (r) => r.type === 'EXPENSE' && isInvestment(r.account_name));
    const expense = sum(rows, (r) => r.type === 'EXPENSE') - savingsExp - investExp;

    const assetDelta = (pred: (name: string) => boolean) => {
        const now = sum(rows, (r) => r.type === 'ASSET' && pred(r.account_name));
        const before = previousRows ? sum(previousRows, (r) => r.type === 'ASSET' && pred(r.account_name)) : now;
        return now - before;
    };

    const assets = sum(rows, (r) => r.type === 'ASSET');
    const liabilities = sum(rows, (r) => r.type === 'LIABILITY');

    return {
        income,
        expense: Math.max(0, expense),
        savings: Math.max(0, savingsExp + assetDelta(isSavings)),
        investment: Math.max(0, investExp + assetDelta(isInvestment)),
        netWorth: assets - liabilities,
    };
}

// ── Validation ──────────────────────────────────────────────────────────────

const clampMoney = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(0, Math.round(n * 100) / 100), 1e12) : 0;
};
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Accepts anything (stored JSON, server response) and returns a valid plan or null. */
export function sanitizeGrowPlan(raw: any): GrowPlan | null {
    if (!raw || typeof raw !== 'object') return null;
    if (!MONTH_RE.test(raw.startMonth) || !MONTH_RE.test(raw.goalMonth)) return null;
    if (monthsBetween(raw.startMonth, raw.goalMonth) < 0) return null;
    const target = (t: any): GrowTarget => ({
        amount: clampMoney(t?.amount),
        frequency: GROW_FREQUENCIES.includes(t?.frequency) ? t.frequency : 'MONTHLY',
    });
    const goal = raw.goalAmount == null ? null : Number(raw.goalAmount);
    return {
        version: 1,
        startMonth: raw.startMonth,
        startNetWorth: Number.isFinite(Number(raw.startNetWorth)) ? Number(raw.startNetWorth) : 0,
        income: target(raw.income),
        expense: target(raw.expense),
        savings: target(raw.savings),
        investment: target(raw.investment),
        annualReturnPct: Math.min(Math.max(0, Number(raw.annualReturnPct) || 0), 100),
        goalMonth: raw.goalMonth,
        goalAmount: goal != null && Number.isFinite(goal) && goal > 0 ? goal : null,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    };
}

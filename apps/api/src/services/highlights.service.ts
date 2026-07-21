import { supabase } from '../lib/supabase';

/**
 * Financial Highlights — the shared money-movement maths behind the Highlights
 * card in the app and the weekly summary email.
 *
 * Everything here is CASH BASIS on the cashbook ledger: debit = money in,
 * credit = money out. That's deliberately the owner's mental model ("what did
 * I make this week"), not an accrual P&L — the Reports screen already covers
 * the accounting view.
 *
 * The one subtlety is internal movement. Wallet-to-wallet transfers and
 * "Transfer to MoneyWise" top-ups write BOTH an inflow leg and an outflow leg
 * (see transferFunds in cashbook.controller.ts), so counting them naively
 * inflates revenue and spending by the same amount and makes a business that
 * merely shuffled its own money look like it traded. Both legs carry the "➡️"
 * marker in their description, which is what isInternalTransfer keys off.
 */

export type AchievementMetric = 'REVENUE' | 'PROFIT';
export type AchievementPeriod = 'DAY' | 'WEEK' | 'MONTH';

export interface CategoryTotal {
    name: string;
    amount: number;
}

export interface PeriodSummary {
    start: string;
    end: string;
    revenue: number;
    spending: number;
    profit: number;
    /** Expense categories for the window, largest first. */
    categories: CategoryTotal[];
    /** Income categories for the window, largest first. */
    revenueCategories: CategoryTotal[];
    /** Largest single inflow in the window, for the "biggest win" line. */
    topInflow: { label: string; amount: number } | null;
}

/** Something the weekly report thinks an admin should look into. */
export interface Concern {
    title: string;
    detail: string;
}

export interface Achievement {
    id: string;
    metric: AchievementMetric;
    period: AchievementPeriod;
    value: number;
    previous_value: number | null;
    period_start: string;
    period_end: string;
    achieved_at: string;
    seen_at: string | null;
}

interface LedgerRow {
    date: string | null;
    created_at: string;
    debit: number | string | null;
    credit: number | string | null;
    description: string | null;
    entry_type: string | null;
    account_id: string | null;
}

/** YYYY-MM-DD in UTC, the same form the ledger's `date` column uses. */
export const iso = (d: Date): string => d.toISOString().slice(0, 10);

export const addDays = (d: Date, days: number): Date => {
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
};

/** Monday-start week containing `d`, as a UTC date at midnight. */
export const startOfWeek = (d: Date): Date => {
    const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dow = out.getUTCDay();            // 0 = Sunday
    const backToMonday = dow === 0 ? 6 : dow - 1;
    return addDays(out, -backToMonday);
};

export const startOfMonth = (d: Date): Date =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/**
 * Both legs of an internal transfer carry the arrow their description was built
 * with. Excluding them keeps "money made" to money that actually entered the
 * business from outside.
 */
const isInternalTransfer = (row: LedgerRow): boolean =>
    (row.description || '').includes('➡️');

/** Balance markers aren't trading activity — they'd otherwise dwarf every real figure. */
const isBalanceMarker = (row: LedgerRow): boolean =>
    row.entry_type === 'OPENING_BALANCE' || row.entry_type === 'CLOSING_BALANCE';

const num = (v: unknown): number => Number(v) || 0;

/** Strips the internal decorations we bolt onto ledger descriptions. */
const cleanLabel = (description: string | null): string => {
    const raw = (description || 'A payment')
        .split(' | Ref:')[0]
        .replace(/^PENDING_INTENT:\s*/, '')
        .trim();
    return raw.length > 60 ? `${raw.slice(0, 57)}…` : (raw || 'A payment');
};

/**
 * Pull the ledger rows that count as trading activity in [start, end]
 * inclusive. Shared by every figure below so the numbers can never disagree
 * with each other.
 */
async function fetchLedgerRows(organizationId: string, start: string, end: string): Promise<LedgerRow[]> {
    const { data, error } = await supabase
        .from('cashbook_entries')
        .select('date, created_at, debit, credit, description, entry_type, account_id')
        .eq('organization_id', organizationId)
        .neq('status', 'PENDING')
        .gte('date', start)
        .lte('date', end);

    if (error) throw error;

    return (data || []).filter(
        (row: LedgerRow) => !isInternalTransfer(row) && !isBalanceMarker(row)
    );
}

/** account_id -> display name, for naming spend/income categories. */
async function fetchAccountNames(organizationId: string): Promise<Map<string, { name: string; type: string }>> {
    const { data, error } = await supabase
        .from('accounts')
        .select('id, name, type')
        .eq('organization_id', organizationId);

    if (error) {
        console.error('[Highlights] Could not load accounts for category names:', error.message);
        return new Map();
    }

    return new Map((data || []).map((a: any) => [a.id, { name: a.name, type: a.type }]));
}

function rollUpCategories(
    rows: LedgerRow[],
    key: 'debit' | 'credit',
    accounts: Map<string, { name: string; type: string }>
): CategoryTotal[] {
    const totals = new Map<string, number>();

    for (const row of rows) {
        const amount = num(row[key]);
        if (amount <= 0) continue;
        const name = (row.account_id && accounts.get(row.account_id)?.name) || 'Uncategorised';
        totals.set(name, (totals.get(name) || 0) + amount);
    }

    return [...totals.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);
}

/**
 * Headline figures for one window. `end` is inclusive.
 */
export async function getPeriodSummary(
    organizationId: string,
    start: string,
    end: string
): Promise<PeriodSummary> {
    const [rows, accounts] = await Promise.all([
        fetchLedgerRows(organizationId, start, end),
        fetchAccountNames(organizationId),
    ]);

    const revenue = rows.reduce((s, r) => s + num(r.debit), 0);
    const spending = rows.reduce((s, r) => s + num(r.credit), 0);

    const biggest = rows
        .filter(r => num(r.debit) > 0)
        .sort((a, b) => num(b.debit) - num(a.debit))[0];

    return {
        start,
        end,
        revenue,
        spending,
        profit: revenue - spending,
        categories: rollUpCategories(rows, 'credit', accounts),
        revenueCategories: rollUpCategories(rows, 'debit', accounts),
        topInflow: biggest
            ? { label: cleanLabel(biggest.description), amount: num(biggest.debit) }
            : null,
    };
}

/**
 * Things worth a second look this week, most serious first.
 *
 * Deliberately conservative: every rule needs both a meaningful percentage move
 * AND a meaningful Kwacha move before it fires. A business whose airtime spend
 * went from K20 to K60 tripled its costs on paper, and flagging that every week
 * would train admins to skim past the section — which is exactly when a real
 * problem slips through.
 */
export function buildConcerns(current: PeriodSummary, previous: PeriodSummary): Concern[] {
    const concerns: Concern[] = [];
    const fmt = (n: number) => `K${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
    const pct = (curr: number, prev: number) =>
        prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / Math.abs(prev)) * 100);

    // Absolute floor for any movement to be worth mentioning at all.
    const MATERIAL = 500;

    // 1. The week cost more than it earned.
    if (current.profit < 0) {
        concerns.push({
            title: 'You spent more than you brought in',
            detail: `Spending exceeded income by ${fmt(current.profit)} this week. Worth checking which costs can wait.`,
        });
    }

    // 2. Income fell sharply.
    const revenueDrop = previous.revenue - current.revenue;
    if (previous.revenue > 0 && revenueDrop > MATERIAL && pct(current.revenue, previous.revenue) <= -25) {
        concerns.push({
            title: 'Sales dropped sharply',
            detail: `Income fell ${Math.abs(pct(current.revenue, previous.revenue))}% to ${fmt(current.revenue)}, ${fmt(revenueDrop)} less than last week.`,
        });
    }

    // 3. Costs climbed sharply.
    const spendRise = current.spending - previous.spending;
    if (previous.spending > 0 && spendRise > MATERIAL && pct(current.spending, previous.spending) >= 25) {
        concerns.push({
            title: 'Spending climbed this week',
            detail: `Costs rose ${pct(current.spending, previous.spending)}% to ${fmt(current.spending)}, ${fmt(spendRise)} more than last week.`,
        });
    }

    // 4. A single category jumped — usually where an unexpected cost hides.
    const previousByCategory = new Map(previous.categories.map(c => [c.name, c.amount]));
    const spikes = current.categories
        .map(cat => ({
            name: cat.name,
            amount: cat.amount,
            prior: previousByCategory.get(cat.name) || 0,
        }))
        .filter(c => c.prior > 0 && c.amount - c.prior > MATERIAL && pct(c.amount, c.prior) >= 50)
        .sort((a, b) => (b.amount - b.prior) - (a.amount - a.prior));

    if (spikes[0]) {
        const spike = spikes[0];
        concerns.push({
            title: `${spike.name} cost a lot more`,
            detail: `${spike.name} rose ${pct(spike.amount, spike.prior)}% to ${fmt(spike.amount)}, up from ${fmt(spike.prior)} last week.`,
        });
    }

    // 5. Spending that hasn't been categorised makes every report unreliable.
    const uncategorised = current.categories.find(c => c.name === 'Uncategorised');
    if (uncategorised && current.spending > 0 && uncategorised.amount / current.spending >= 0.2 && uncategorised.amount > MATERIAL) {
        concerns.push({
            title: 'Some spending is uncategorised',
            detail: `${fmt(uncategorised.amount)} of what you spent has no category. Your reports stay approximate until it's assigned.`,
        });
    }

    // 6. Most of the income came from one source — a concentration risk.
    const topSource = current.revenueCategories[0];
    if (topSource && current.revenue > 0 && topSource.amount / current.revenue >= 0.7 && current.revenueCategories.length > 1) {
        concerns.push({
            title: 'Most income came from one source',
            detail: `${Math.round((topSource.amount / current.revenue) * 100)}% of your income came from ${topSource.name}. Losing it would hit hard.`,
        });
    }

    return concerns.slice(0, 3);
}

/**
 * Roll the org's entire trading history into per-day, per-week and per-month
 * revenue/profit buckets. One query — record detection compares the just-closed
 * window against every earlier one, so it needs the whole history anyway.
 */
async function bucketHistory(organizationId: string): Promise<{
    DAY: Map<string, { revenue: number; profit: number }>;
    WEEK: Map<string, { revenue: number; profit: number }>;
    MONTH: Map<string, { revenue: number; profit: number }>;
}> {
    const { data, error } = await supabase
        .from('cashbook_entries')
        .select('date, created_at, debit, credit, description, entry_type, account_id')
        .eq('organization_id', organizationId)
        .neq('status', 'PENDING');

    if (error) throw error;

    const buckets = {
        DAY: new Map<string, { revenue: number; profit: number }>(),
        WEEK: new Map<string, { revenue: number; profit: number }>(),
        MONTH: new Map<string, { revenue: number; profit: number }>(),
    };

    const add = (
        map: Map<string, { revenue: number; profit: number }>,
        key: string,
        revenue: number,
        spending: number
    ) => {
        const cur = map.get(key) || { revenue: 0, profit: 0 };
        cur.revenue += revenue;
        cur.profit += revenue - spending;
        map.set(key, cur);
    };

    for (const row of (data || []) as LedgerRow[]) {
        if (isInternalTransfer(row) || isBalanceMarker(row)) continue;
        const day = (row.date || row.created_at || '').slice(0, 10);
        if (!day) continue;

        const asDate = new Date(`${day}T00:00:00Z`);
        if (Number.isNaN(asDate.getTime())) continue;

        const revenue = num(row.debit);
        const spending = num(row.credit);

        add(buckets.DAY, day, revenue, spending);
        add(buckets.WEEK, iso(startOfWeek(asDate)), revenue, spending);
        add(buckets.MONTH, iso(startOfMonth(asDate)), revenue, spending);
    }

    return buckets;
}

const periodEnd = (period: AchievementPeriod, startKey: string): string => {
    const start = new Date(`${startKey}T00:00:00Z`);
    if (period === 'DAY') return startKey;
    if (period === 'WEEK') return iso(addDays(start, 6));
    return iso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)));
};

/**
 * Detect all-time records and persist any that are new.
 *
 * A window only qualifies once it is COMPLETE — we never celebrate a
 * "best day ever" at 9am on a day that's barely started, or a record month on
 * the 2nd. For each metric/period we take the best complete window, and
 * record it only if it beats every other complete window.
 *
 * Idempotent: re-running for the same window updates the existing row (unique
 * on org+metric+period+period_start), so the badge never duplicates.
 */
export async function detectAchievements(
    organizationId: string,
    now: Date = new Date()
): Promise<Achievement[]> {
    const buckets = await bucketHistory(organizationId);

    const today = iso(now);
    const thisWeek = iso(startOfWeek(now));
    const thisMonth = iso(startOfMonth(now));

    // Windows still in progress can't hold a record yet.
    const inProgress: Record<AchievementPeriod, string> = {
        DAY: today,
        WEEK: thisWeek,
        MONTH: thisMonth,
    };

    const candidates: {
        metric: AchievementMetric;
        period: AchievementPeriod;
        periodStart: string;
        value: number;
        previous: number | null;
    }[] = [];

    for (const period of ['DAY', 'WEEK', 'MONTH'] as AchievementPeriod[]) {
        const complete = [...buckets[period].entries()].filter(
            ([key]) => key !== inProgress[period]
        );
        if (complete.length === 0) continue;

        for (const metric of ['REVENUE', 'PROFIT'] as AchievementMetric[]) {
            const field = metric === 'REVENUE' ? 'revenue' : 'profit';
            const ranked = complete
                .map(([key, totals]) => ({ key, value: totals[field] }))
                .filter(entry => entry.value > 0)
                .sort((a, b) => b.value - a.value);

            const best = ranked[0];
            if (!best) continue;

            candidates.push({
                metric,
                period,
                periodStart: best.key,
                value: Number(best.value.toFixed(2)),
                previous: ranked[1] ? Number(ranked[1].value.toFixed(2)) : null,
            });
        }
    }

    if (candidates.length === 0) return [];

    // Only write rows we don't already hold for that exact window.
    const { data: existing, error: existingError } = await supabase
        .from('business_achievements')
        .select('metric, period, period_start')
        .eq('organization_id', organizationId);

    if (existingError) {
        console.error('[Highlights] Could not read existing achievements:', existingError.message);
        return [];
    }

    const held = new Set(
        (existing || []).map((r: any) => `${r.metric}|${r.period}|${r.period_start}`)
    );

    const fresh = candidates.filter(
        c => !held.has(`${c.metric}|${c.period}|${c.periodStart}`)
    );
    if (fresh.length === 0) return [];

    const { data: inserted, error: insertError } = await supabase
        .from('business_achievements')
        .upsert(
            fresh.map(c => ({
                organization_id: organizationId,
                metric: c.metric,
                period: c.period,
                value: c.value,
                previous_value: c.previous,
                period_start: c.periodStart,
                period_end: periodEnd(c.period, c.periodStart),
            })),
            { onConflict: 'organization_id,metric,period,period_start' }
        )
        .select();

    if (insertError) {
        console.error('[Highlights] Could not record achievements:', insertError.message);
        return [];
    }

    return (inserted || []) as Achievement[];
}

/** Achievements the user hasn't been shown yet, newest first. */
export async function getUnseenAchievements(organizationId: string): Promise<Achievement[]> {
    const { data, error } = await supabase
        .from('business_achievements')
        .select('*')
        .eq('organization_id', organizationId)
        .is('seen_at', null)
        .order('achieved_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('[Highlights] Could not load unseen achievements:', error.message);
        return [];
    }
    return (data || []) as Achievement[];
}

export async function markAchievementsSeen(organizationId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase
        .from('business_achievements')
        .update({ seen_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .in('id', ids);

    if (error) console.error('[Highlights] Could not mark achievements seen:', error.message);
}

/** Human label for a badge, e.g. "Best revenue day ever". */
export function achievementTitle(a: Pick<Achievement, 'metric' | 'period'>): string {
    const metric = a.metric === 'REVENUE' ? 'sales' : 'profit';
    const period = a.period.toLowerCase();
    return `Best ${metric} ${period} ever`;
}

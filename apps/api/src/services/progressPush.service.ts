import { supabase } from '../lib/supabase';
import { pushService } from './push.service';
import { getGrowPlan } from './userPreferences.service';
import { isPersonalOrganization } from '../lib/orgType';
import { computeFinancials, isOrgFullyPosted } from '../controllers/report.controller';

/**
 * Grow plan check-ins (topic "insights", Android channel "Progress updates"). They keep a person honest with the plan
 * they set in Grow: are they on track, overspending, or not saving enough. Every figure is worked out exactly the way
 * the Grow screen does (same reports, same four buckets), so the notification and the screen always agree, and only
 * what has been recorded in MoneyWise counts.
 *
 *   weekly (Monday 08:00)   where this month stands against the plan: on track / spending ahead / saving behind
 *   daily  (18:00)          only when something changed, each at most once:
 *                             - the 1st: how last month went against the plan
 *                             - spending passed 80%, then 100%, of this month's budget
 *                             - this month's savings target reached
 *                             - the last 5 days of the month with savings still short
 *                             - a personal account with no Grow plan: set one up (at most every 14 days)
 *
 * Only for people with the app installed (a push token). "Progress updates" switched off, or email-only, is respected
 * by pushService. A plan only nags while it is running (its start month to its goal month).
 */

const money = (n: number) => `K${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

type Frequency = 'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
interface Target { amount: number; frequency: Frequency }
export interface GrowPlanLite {
    startMonth: string; goalMonth: string; goalAmount: number | null;
    income: Target; expense: Target; savings: Target; investment: Target;
}

/** A Grow target in its own rhythm → one calendar month (same maths as the app's packages/core/src/grow). */
export function amountForMonth(t: Target | undefined, year: number, month: number): number {
    const a = Number.isFinite(Number(t?.amount)) ? Math.max(0, Number(t!.amount)) : 0;
    switch (t?.frequency) {
        case 'DAILY': return a * new Date(Date.UTC(year, month, 0)).getUTCDate();
        case 'WEEKLY': return (a * 52) / 12;
        case 'FORTNIGHTLY': return (a * 26) / 12;
        case 'QUARTERLY': return a / 3;
        case 'YEARLY': return a / 12;
        default: return a;
    }
}

// ── The Grow screen's four buckets (copied from packages/core/src/grow summariseGrowMonth; keep in step) ──────────
interface LedgerRow { account_name: string; type: string; total_amount: number }
export interface Actuals { income: number; expense: number; savings: number; investment: number }
const SAVINGS_RE = /sav(e|ing)/i;
const INVEST_RE = /invest|shares?\b|stocks?\b|bonds?\b|unit trust|treasury|t-?bills?|pension|retire|dividend portfolio/i;
const isSavings = (name: string) => SAVINGS_RE.test(name);
const isInvestment = (name: string) => !isSavings(name) && INVEST_RE.test(name);

export function summariseMonth(rows: LedgerRow[], previousRows: LedgerRow[] | null): Actuals {
    const sum = (list: LedgerRow[], pred: (r: LedgerRow) => boolean) => list.filter(pred).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    const savingsExp = sum(rows, (r) => r.type === 'EXPENSE' && isSavings(r.account_name));
    const investExp = sum(rows, (r) => r.type === 'EXPENSE' && isInvestment(r.account_name));
    const assetDelta = (pred: (name: string) => boolean) => {
        const now = sum(rows, (r) => r.type === 'ASSET' && pred(r.account_name));
        return now - (previousRows ? sum(previousRows, (r) => r.type === 'ASSET' && pred(r.account_name)) : now);
    };
    return {
        income: sum(rows, (r) => r.type === 'INCOME'),
        expense: Math.max(0, sum(rows, (r) => r.type === 'EXPENSE') - savingsExp - investExp),
        savings: Math.max(0, savingsExp + assetDelta(isSavings)),
        investment: Math.max(0, investExp + assetDelta(isInvestment)),
    };
}

// ── Month arithmetic (Lusaka is always UTC+2) ────────────────────────────────────────────────────────────────────
interface MonthRef { key: string; year: number; month: number; start: string; end: string; days: number; name: string; short: string }
const pad = (n: number) => String(n).padStart(2, '0');
function monthRef(year: number, month: number): MonthRef {
    const y = month < 1 ? year - 1 : month > 12 ? year + 1 : year;
    const m = month < 1 ? 12 : month > 12 ? 1 : month;
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const d = new Date(Date.UTC(y, m - 1, 1));
    return {
        key: `${y}-${pad(m)}`, year: y, month: m, start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(days)}`, days,
        name: d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }),
        short: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    };
}
const lusakaToday = (now: Date) => new Date(now.getTime() + 2 * 3600_000);
const planRunning = (plan: GrowPlanLite, key: string) => plan.startMonth <= key && key <= plan.goalMonth;
function goalLine(plan: GrowPlanLite): string {
    const [y, m] = plan.goalMonth.split('-').map(Number);
    const by = monthRef(y, m).short;
    return plan.goalAmount ? `your goal of ${money(plan.goalAmount)} by ${by}` : `your goal for ${by}`;
}

// ── What to say (pure, tested offline) ───────────────────────────────────────────────────────────────────────────
export interface MonthState {
    plan: GrowPlanLite; month: MonthRef; day: number; actuals: Actuals;
}
type Push = { key: string; title: string; body: string; type: string };

/** Monday: how this month is going against the plan, judged against where it should be by today. */
export function weeklyCheckIn(s: MonthState): Push | null {
    if (s.day < 4) return null;                          // too early in the month to judge; the 1st's review covers it
    const budget = amountForMonth(s.plan.expense, s.month.year, s.month.month);
    const saveTarget = amountForMonth(s.plan.savings, s.month.year, s.month.month);
    if (budget <= 0 && saveTarget <= 0) return null;
    const pace = s.day / s.month.days;
    const daysLeft = s.month.days - s.day;
    const overspending = budget > 0 && s.actuals.expense > budget * pace * 1.1 && s.actuals.expense - budget * pace >= 50;
    const underSaving = saveTarget > 0 && s.actuals.savings < saveTarget * pace * 0.9 && saveTarget * pace - s.actuals.savings >= 50;
    const key = `weekly:${s.month.key}-${pad(s.day)}`;

    if (overspending && underSaving) {
        return { key, type: 'insights', title: 'Your Grow plan needs attention',
            body: `You've spent ${money(s.actuals.expense)} of your ${money(budget)} budget and saved ${money(s.actuals.savings)} of ${money(saveTarget)}, with ${plural(daysLeft, 'day')} to go. Spending less now leaves room to save.` };
    }
    if (overspending) {
        const left = budget - s.actuals.expense;
        return { key, type: 'insights', title: 'You’re spending faster than your plan',
            body: left > 0
                ? `${money(s.actuals.expense)} spent so far — about ${money(budget * pace)} would be on plan by now. ${money(left)} left for the next ${plural(daysLeft, 'day')}.`
                : `${money(s.actuals.expense)} spent, over your ${money(budget)} ${s.month.name} budget. Easing off keeps ${goalLine(s.plan)} in reach.` };
    }
    if (underSaving) {
        return { key, type: 'insights', title: 'You’re behind on saving this month',
            body: `${money(s.actuals.savings)} saved so far; about ${money(saveTarget * pace)} by now keeps you on track for ${goalLine(s.plan)}. ${money(saveTarget - s.actuals.savings)} to go this month.` };
    }
    const bits = [
        budget > 0 ? `${money(s.actuals.expense)} of ${money(budget)} spent` : null,
        saveTarget > 0 ? `${money(s.actuals.savings)} of ${money(saveTarget)} saved` : null,
    ].filter(Boolean).join(', ');
    return { key, type: 'insights', title: 'You’re on track with your Grow plan 👍', body: `${bits}. Keep it up — ${goalLine(s.plan)}.` };
}

/** 18:00 alerts that fire once each: budget 80% / over, savings reached, savings short near the month's end. */
export function dailyAlerts(s: MonthState): Push[] {
    const out: Push[] = [];
    const budget = amountForMonth(s.plan.expense, s.month.year, s.month.month);
    const saveTarget = amountForMonth(s.plan.savings, s.month.year, s.month.month);
    const daysLeft = s.month.days - s.day;
    if (budget > 0) {
        const used = s.actuals.expense / budget;
        if (used >= 1) {
            out.push({ key: `spend100:${s.month.key}`, type: 'insights', title: `You’ve gone over your ${s.month.name} budget`,
                body: `${money(s.actuals.expense)} spent against the ${money(budget)} in your Grow plan. Every Kwacha you hold back now goes toward ${goalLine(s.plan)}.` });
        } else if (used >= 0.8) {
            out.push({ key: `spend80:${s.month.key}`, type: 'insights', title: `${Math.floor(used * 100)}% of your ${s.month.name} budget used`,
                body: `${money(budget - s.actuals.expense)} left to spend for the next ${plural(daysLeft, 'day')} to stay on your Grow plan.` });
        }
    }
    if (saveTarget > 0) {
        if (s.actuals.savings + 0.005 >= saveTarget) {
            out.push({ key: `savemet:${s.month.key}`, type: 'insights', title: `${s.month.name} savings target reached 🎉`,
                body: `${money(s.actuals.savings)} saved this month. That’s a step closer to ${goalLine(s.plan)}.` });
        } else if (daysLeft <= 5) {
            out.push({ key: `savenudge:${s.month.key}`, type: 'insights', title: `${money(saveTarget - s.actuals.savings)} more to save this month`,
                body: `${plural(daysLeft, 'day')} left to reach your ${money(saveTarget)} target and stay on track for ${goalLine(s.plan)}.` });
        }
    }
    return out;
}

/** The 1st: how the month that just ended went against the plan. */
export function monthReview(plan: GrowPlanLite, month: MonthRef, a: Actuals): Push | null {
    const t = {
        income: amountForMonth(plan.income, month.year, month.month), expense: amountForMonth(plan.expense, month.year, month.month),
        savings: amountForMonth(plan.savings, month.year, month.month), investment: amountForMonth(plan.investment, month.year, month.month),
    };
    const set = (Object.keys(t) as (keyof Actuals)[]).filter((k) => t[k] > 0);
    if (!set.length) return null;
    const met = set.filter((k) => (k === 'expense' ? a[k] <= t[k] + 0.005 : a[k] + 0.005 >= t[k]));
    const missed = set.filter((k) => !met.includes(k));
    const label: Record<keyof Actuals, string> = { income: 'income', expense: 'spending', savings: 'saving', investment: 'investing' };
    const key = `review:${month.key}`;
    if (!missed.length) {
        return { key, type: 'insights', title: `${month.name}: every Grow target met 🎉`,
            body: `You stayed on plan all month. Keep the same rhythm in the new month to reach ${goalLine(plan)}.` };
    }
    const detail = missed.map((k) => k === 'expense'
        ? `spent ${money(a.expense - t.expense)} over budget`
        : `${label[k]} was ${money(t[k] - a[k])} short`).join('; ');
    return { key, type: 'insights', title: `${month.name}: ${met.length} of ${set.length} Grow targets met`,
        body: `${detail.charAt(0).toUpperCase()}${detail.slice(1)}. A fresh month starts today — tap to see your plan.` };
}

// ── Running it ───────────────────────────────────────────────────────────────────────────────────────────────────

/** People with the app installed, and the workspace each is in now. */
async function audience(): Promise<{ userId: string; orgId: string }[]> {
    const ids = new Set<string>();
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('push_tokens').select('user_id').order('token').range(from, from + 999);
        if (error) throw new Error(`Could not load push tokens: ${error.message}`);
        (data ?? []).forEach((r: any) => ids.add(r.user_id));
        if (!data || data.length < 1000) break;
    }
    const out: { userId: string; orgId: string }[] = [];
    const list = [...ids];
    for (let i = 0; i < list.length; i += 200) {
        const { data } = await supabase.from('users').select('id, organization_id').in('id', list.slice(i, i + 200));
        (data ?? []).forEach((u: any) => { if (u.organization_id) out.push({ userId: u.id, orgId: u.organization_id }); });
    }
    return out;
}

/** Claims an alert key; false if it was already sent. */
async function claim(userId: string, orgId: string, key: string): Promise<boolean> {
    const { error } = await supabase.from('push_alert_log').insert({ user_id: userId, organization_id: orgId, key });
    if (!error) return true;
    if (error.code === '23505') return false;
    throw new Error(`Could not record alert ${key}: ${error.message}`);
}

/** Month-to-date actuals for a workspace, the way the Grow screen computes them. Cached per run. */
function actualsLoader(todayIso: string) {
    const cache = new Map<string, Promise<Actuals>>();
    return (orgId: string, m: MonthRef) => {
        const k = `${orgId}|${m.key}`;
        if (!cache.has(k)) cache.set(k, (async () => {
            const full = await isOrgFullyPosted(orgId);
            const prev = monthRef(m.year, m.month - 1);
            const end = m.end < todayIso ? m.end : todayIso;
            const [rows, prevRows] = await Promise.all([computeFinancials(orgId, m.start, end, full), computeFinancials(orgId, prev.start, prev.end, full)]);
            const norm = (r: any[]) => (r || []).map((x: any) => ({ account_name: x.account_name, type: x.type, total_amount: Number(x.total_amount) || 0 }));
            return summariseMonth(norm(rows), norm(prevRows));
        })());
        return cache.get(k)!;
    };
}

async function send(userId: string, orgId: string, p: Push): Promise<boolean> {
    if (!(await claim(userId, orgId, p.key))) return false;
    await pushService.sendToUser(userId, { title: p.title, body: p.body, topic: 'insights', orgId, data: { type: p.type } });
    return true;
}

export async function sendWeeklyProgress(budgetMs: number, now = new Date()) {
    const deadline = Date.now() + budgetMs;
    const result = { people: 0, sent: 0, errors: [] as string[] };
    const local = lusakaToday(now);
    const month = monthRef(local.getUTCFullYear(), local.getUTCMonth() + 1);
    const load = actualsLoader(local.toISOString().slice(0, 10));

    for (const { userId, orgId } of await audience()) {
        if (Date.now() > deadline) break;
        try {
            const plan = (await getGrowPlan(userId, orgId)) as GrowPlanLite | null;
            if (!plan || !planRunning(plan, month.key)) continue;
            result.people++;
            const push = weeklyCheckIn({ plan, month, day: local.getUTCDate(), actuals: await load(orgId, month) });
            if (push && (await send(userId, orgId, push))) result.sent++;
        } catch (e: any) { result.errors.push(`user ${userId}: ${e?.message}`); }
    }
    return result;
}

export async function sendDailyProgress(budgetMs: number, now = new Date()) {
    const deadline = Date.now() + budgetMs;
    const result = { people: 0, sent: 0, errors: [] as string[] };
    const local = lusakaToday(now);
    const day = local.getUTCDate();
    const month = monthRef(local.getUTCFullYear(), local.getUTCMonth() + 1);
    const last = monthRef(month.year, month.month - 1);
    const load = actualsLoader(local.toISOString().slice(0, 10));

    for (const { userId, orgId } of await audience()) {
        if (Date.now() > deadline) break;
        result.people++;
        try {
            const plan = (await getGrowPlan(userId, orgId)) as GrowPlanLite | null;
            if (!plan) {
                // To-do: a personal account without a Grow plan. At most every 14 days.
                if (!(await isPersonalOrganization(orgId))) continue;
                const fortnight = Math.floor(now.getTime() / (14 * 86400_000));
                const sent = await send(userId, orgId, { key: `growsetup:${fortnight}`, type: 'grow_setup', title: 'Set up your Grow plan',
                    body: 'Choose what you want to reach and by when. MoneyWise will tell you each week if you’re on track, overspending or not saving enough.' });
                if (sent) result.sent++;
                continue;
            }
            // The 1st: last month's result. Then nothing else today: the new month has barely started.
            if (day === 1) {
                if (planRunning(plan, last.key)) {
                    const review = monthReview(plan, last, await load(orgId, last));
                    if (review && (await send(userId, orgId, review))) result.sent++;
                }
                continue;
            }
            if (!planRunning(plan, month.key)) continue;
            for (const a of dailyAlerts({ plan, month, day, actuals: await load(orgId, month) })) {
                if (await send(userId, orgId, a)) result.sent++;
            }
        } catch (e: any) { result.errors.push(`user ${userId}: ${e?.message}`); }
    }
    return result;
}

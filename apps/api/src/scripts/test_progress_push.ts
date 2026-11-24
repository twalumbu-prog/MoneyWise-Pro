/**
 * Offline checks for the Grow plan check-ins' rules and wording (no database, nothing sent).
 * Run: TS_NODE_PROJECT=./tsconfig.json npx ts-node --transpile-only src/scripts/test_progress_push.ts
 * (needs dummy SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY so the imports load).
 */
import assert from 'assert';
import { weeklyCheckIn, dailyAlerts, monthReview, amountForMonth, summariseMonth, type GrowPlanLite, type Actuals } from '../services/progressPush.service';

let failed = 0;
const test = (name: string, fn: () => void) => {
    try { fn(); console.log(`✓ ${name}`); } catch (e: any) { failed++; console.log(`✗ ${name}\n    ${e.message}`); }
};
const plan: GrowPlanLite = {
    startMonth: '2026-01', goalMonth: '2027-12', goalAmount: 50000,
    income: { amount: 0, frequency: 'MONTHLY' }, expense: { amount: 3000, frequency: 'MONTHLY' },
    savings: { amount: 1000, frequency: 'MONTHLY' }, investment: { amount: 0, frequency: 'MONTHLY' },
};
// November 2026: 30 days.
const nov = { key: '2026-11', year: 2026, month: 11, start: '2026-11-01', end: '2026-11-30', days: 30, name: 'November', short: 'Nov 2026' };
const act = (a: Partial<Actuals>): Actuals => ({ income: 0, expense: 0, savings: 0, investment: 0, ...a });
const state = (day: number, a: Partial<Actuals>) => ({ plan, month: nov, day, actuals: act(a) });

test('a weekly target becomes 52/12 a month', () => assert.strictEqual(Math.round(amountForMonth({ amount: 120, frequency: 'WEEKLY' }, 2026, 11)), 520));
test('a daily target uses the days in that month', () => assert.strictEqual(amountForMonth({ amount: 10, frequency: 'DAILY' }, 2026, 2), 280));

// Day 15 = half the month: on plan is K1,500 spent and K500 saved.
test('weekly: on track', () => {
    const p = weeklyCheckIn(state(15, { expense: 1400, savings: 520 }))!;
    assert.match(p.title, /on track/); assert.match(p.body, /K1,400 of K3,000 spent, K520 of K1,000 saved/); assert.match(p.body, /K50,000 by Dec 2027/);
});
test('weekly: spending ahead of plan', () => {
    const p = weeklyCheckIn(state(15, { expense: 2200, savings: 500 }))!;
    assert.match(p.title, /spending faster/); assert.match(p.body, /about K1,500 would be on plan/); assert.match(p.body, /K800 left/);
});
test('weekly: over the whole budget', () => assert.match(weeklyCheckIn(state(15, { expense: 3200, savings: 500 }))!.body, /over your K3,000 November budget/));
test('weekly: saving behind', () => {
    const p = weeklyCheckIn(state(15, { expense: 1400, savings: 100 }))!;
    assert.match(p.title, /behind on saving/); assert.match(p.body, /K900 to go/);
});
test('weekly: both', () => assert.match(weeklyCheckIn(state(15, { expense: 2500, savings: 0 }))!.title, /needs attention/));
test('weekly: too early in the month', () => assert.strictEqual(weeklyCheckIn(state(2, { expense: 900 })), null));

test('daily: nothing to say mid-month on plan', () => assert.deepStrictEqual(dailyAlerts(state(15, { expense: 1400, savings: 400 })), []));
test('daily: 80% of budget', () => {
    const a = dailyAlerts(state(20, { expense: 2500, savings: 900 }));
    assert.deepStrictEqual(a.map((x) => x.key), ['spend80:2026-11']); assert.match(a[0].body, /K500 left to spend for the next 10 days/);
});
test('daily: over budget replaces 80%', () => assert.deepStrictEqual(dailyAlerts(state(20, { expense: 3100, savings: 900 })).map((x) => x.key), ['spend100:2026-11']));
test('daily: savings target reached', () => assert.deepStrictEqual(dailyAlerts(state(12, { savings: 1000 })).map((x) => x.key), ['savemet:2026-11']));
test('daily: savings nudge in the last 5 days only', () => {
    assert.deepStrictEqual(dailyAlerts(state(20, { savings: 300 })), []);
    const a = dailyAlerts(state(27, { savings: 300 }));
    assert.deepStrictEqual(a.map((x) => x.key), ['savenudge:2026-11']); assert.strictEqual(a[0].title, 'K700 more to save this month');
});

test('review: every target met', () => assert.match(monthReview(plan, nov, act({ expense: 2900, savings: 1000 }))!.title, /every Grow target met/));
test('review: overspent and short on saving', () => {
    const p = monthReview(plan, nov, act({ expense: 3400, savings: 600 }))!;
    assert.strictEqual(p.title, 'November: 0 of 2 Grow targets met');
    assert.match(p.body, /Spent K400 over budget; saving was K400 short/);
});

test('buckets: a "Savings" expense counts as saving, not spending', () => {
    const a = summariseMonth([
        { account_name: 'Food', type: 'EXPENSE', total_amount: 700 },
        { account_name: 'Monthly savings', type: 'EXPENSE', total_amount: 300 },
        { account_name: 'Salary', type: 'INCOME', total_amount: 5000 },
    ], null);
    assert.deepStrictEqual(a, { income: 5000, expense: 700, savings: 300, investment: 0 });
});

console.log(failed ? `\n${failed} failing` : '\nall passed');
process.exit(failed ? 1 : 0);

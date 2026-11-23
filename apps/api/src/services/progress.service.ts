import { supabase } from '../lib/supabase';

/**
 * Progress: tiered badges, a daily-use streak, XP, spendable points and fee credit.
 *
 *   badges   bronze / silver / gold / platinum; each is earned once per person. Four kinds: easy "just open this page" badges, guided missions,
 *            consistent use (a streak of days) and money movement (how many entries and how much money, from the account's real ledger).
 *   XP       not stored: the sum of the XP of the badges earned, so it can't drift.
 *   points   XP the person chooses to convert (XP_PER_POINT XP = 1 point, once a month), plus gifts for gold and platinum badges.
 *   credit   points redeemed into kwacha of fee credit (POINTS_PER_KWACHA points = K1, redeemed in whole kwacha). The credit is a balance on the ledger; applying it to a fee
 *            is a separate step (see docs/ROADMAP.md).
 * The catalogue lives here so the server is the one source of truth; the apps ask for it.
 */
export type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
export type Rule =
    | { type: 'visit'; paths: string[] }
    | { type: 'mission' }
    | { type: 'streak'; days: number }
    | { type: 'txn_count'; n: number }
    | { type: 'volume'; amount: number };
export type Family = 'EXPLORE' | 'MISSION' | 'CONSISTENCY' | 'MONEY';
export interface Badge { id: string; name: string; description: string; tier: Tier; xp: number; family: Family; rule: Rule }

/** 20 XP = 1 point; 10 points = K1 of fee credit (so 200 XP is worth K1). XP can be converted once a calendar month. */
export const XP_PER_POINT = 20;
export const POINTS_PER_KWACHA = 10;
export const POINT_VALUE_K = 1 / POINTS_PER_KWACHA;
/** Points gifted the moment a badge of this tier is earned (higher badges are worth more than their XP alone). */
export const GIFT_POINTS: Record<Tier, number> = { BRONZE: 0, SILVER: 0, GOLD: 5, PLATINUM: 25 };
export const TIER_XP: Record<Tier, number> = { BRONZE: 10, SILVER: 30, GOLD: 75, PLATINUM: 200 };
/** XP needed to reach each level (level 1 is 0). */
export const LEVELS = [0, 50, 150, 300, 500, 800, 1200, 1800, 2600, 3600];

const visit = (id: string, name: string, description: string, xp: number, paths: string[]): Badge => ({ id, name, description, tier: 'BRONZE', xp, family: 'EXPLORE', rule: { type: 'visit', paths } });
const streak = (days: number, tier: Tier, name: string, description: string): Badge => ({ id: `streak_${days}`, name, description, tier, xp: TIER_XP[tier], family: 'CONSISTENCY', rule: { type: 'streak', days } });
const txn = (n: number, tier: Tier, name: string, description: string): Badge => ({ id: `txn_${n}`, name, description, tier, xp: TIER_XP[tier], family: 'MONEY', rule: { type: 'txn_count', n } });
const vol = (amount: number, id: string, tier: Tier, name: string, description: string): Badge => ({ id, name, description, tier, xp: TIER_XP[tier], family: 'MONEY', rule: { type: 'volume', amount } });
const mission = (id: string, name: string, description: string, tier: Tier, xp: number): Badge => ({ id, name, description, tier, xp, family: 'MISSION', rule: { type: 'mission' } });

export const CATALOGUE: Badge[] = [
    // Easy ones: open the page while signed in (earned by accident as often as on purpose).
    visit('visit_home', 'Welcome Aboard', 'You opened MoneyWise Pro. Welcome aboard!', 10, ['/', '/requisitions']),
    visit('visit_settings', 'Settings Explorer', 'Open Settings to see everything you can set up.', 10, ['/settings']),
    visit('visit_bi', 'Curious Mind', 'Open Business Intelligence and see how your money is moving.', 15, ['/intelligence']),
    visit('visit_schedules', 'Calendar Peeker', 'Open Schedules to see upcoming payments and reminders.', 10, ['/schedules']),
    visit('visit_budgets', 'Budget Watcher', 'Open Budgets, where you plan what to spend.', 15, ['/budgets']),
    visit('visit_savings', 'Piggy Bank', 'Open Savings and take a look at your goals.', 15, ['/savings']),
    visit('visit_marketplace', 'Window Shopper', 'Browse the Marketplace and see what is on offer.', 15, ['/marketplace']),
    visit('visit_new_sale', 'Sale Starter', 'Open New Sale. You do not have to finish it.', 15, ['/sales/new']),
    visit('visit_send', 'Ready to Send', 'Open the Send screen, ready for when you need it.', 10, ['/send']),
    visit('visit_approvals', 'Approver', 'Open Approvals to see what is waiting for a decision.', 10, ['/approvals']),
    visit('visit_rewards', 'Reward Curious', 'Open Rewards and see how customers can earn.', 15, ['/rewards/manage']),
    visit('visit_invest', 'Investor in Waiting', 'Open Invest and see the fund prices.', 15, ['/invest/accounts', '/invest/prices']),
    // Guided missions (the app reports when the person finishes the tour).
    mission('add_team_member', 'Team Builder', 'Invite a team member.', 'SILVER', 100),
    mission('create_first_requisition', 'Request Starter', 'Send your first request.', 'SILVER', 150),
    mission('explore_bi', 'Data Voyager', 'Explore Business Intelligence.', 'BRONZE', 120),
    mission('check_wallet_inflows', 'Cash Commander', 'Inspect your cash and inflows.', 'BRONZE', 100),
    mission('schedule_payment', 'Automation Pro', 'Set up a scheduled payment.', 'GOLD', 200),
    // Consistent use: days in a row.
    streak(3, 'BRONZE', 'Back Again', 'Use MoneyWise Pro 3 days in a row.'),
    streak(7, 'SILVER', 'Weekly Regular', 'Use MoneyWise Pro 7 days in a row.'),
    streak(30, 'GOLD', 'Monthly Habit', 'Use MoneyWise Pro 30 days in a row.'),
    streak(100, 'PLATINUM', 'Centurion', 'Use MoneyWise Pro 100 days in a row.'),
    // Money movement: how many entries, and how much money.
    txn(1, 'BRONZE', 'First Move', 'Your first confirmed money movement.'),
    txn(10, 'SILVER', 'Getting Busy', '10 confirmed money movements.'),
    txn(50, 'GOLD', 'Money Mover', '50 confirmed money movements.'),
    txn(250, 'PLATINUM', 'Money Master', '250 confirmed money movements.'),
    vol(1_000, 'vol_1k', 'BRONZE', 'First Thousand', 'K1,000 moved in and out.'),
    vol(10_000, 'vol_10k', 'SILVER', 'Ten Thousand Club', 'K10,000 moved in and out.'),
    vol(100_000, 'vol_100k', 'GOLD', 'Six Figures', 'K100,000 moved in and out.'),
    vol(1_000_000, 'vol_1m', 'PLATINUM', 'Millionaire Mover', 'K1,000,000 moved in and out.'),
];
const BY_ID = new Map(CATALOGUE.map((b) => [b.id, b]));

export class ProgressError extends Error {
    constructor(message: string, public httpStatus = 400, public code = 'PROGRESS') { super(message); }
}

/** Today in Lusaka (UTC+2, no daylight saving), as YYYY-MM-DD. */
export const lusakaDay = (now = new Date()): string => new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
const dayBefore = (day: string): string => new Date(Date.parse(`${day}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);

/** The streak after activity on `today`, given what was stored. Same day: unchanged. The day after: one more. Anything else: starts again at 1. */
export function nextStreak(prev: { streak: number; best: number; days: number; last: string | null }, today: string) {
    if (prev.last === today) return { streak: prev.streak, best: prev.best, days: prev.days, changed: false };
    const streak = prev.last && prev.last === dayBefore(today) ? prev.streak + 1 : 1;
    return { streak, best: Math.max(prev.best, streak), days: prev.days + 1, changed: true };
}

/** Which page-visit badges opening `path` earns (a path matches itself and anything under it; '/' only the home page). */
export function visitBadgesFor(path: string): Badge[] {
    const p = path.split('?')[0].replace(/\/+$/, '') || '/';
    return CATALOGUE.filter((b) => b.rule.type === 'visit' && b.rule.paths.some((v) => (v === '/' ? p === '/' : p === v || p.startsWith(`${v}/`))));
}

/** The badges that the numbers alone earn (streak and money). */
export function badgesFromStats(stats: { streak: number; txnCount: number; volume: number }): Badge[] {
    return CATALOGUE.filter((b) => (b.rule.type === 'streak' && stats.streak >= b.rule.days) || (b.rule.type === 'txn_count' && stats.txnCount >= b.rule.n) || (b.rule.type === 'volume' && stats.volume >= b.rule.amount));
}

export function levelFor(xp: number) {
    let level = 1;
    for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) level = i + 1;
    const next = LEVELS[level] ?? null;
    return { level, xp, nextAt: next, toNext: next === null ? 0 : next - xp, thisAt: LEVELS[level - 1] };
}

const num = (v: unknown) => Number(v) || 0;
/** The first day of next month in Lusaka (when the monthly XP conversion opens again). */
const firstOfNextMonth = (now = new Date()): string => { const d = lusakaDay(now); const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; };

async function moneyStats(orgId: string | null): Promise<{ txnCount: number; volume: number }> {
    if (!orgId) return { txnCount: 0, volume: 0 };
    const { data, error } = await supabase.rpc('progress_money_stats', { p_org: orgId });
    if (error) { console.error('[Progress] money stats failed:', error.message); return { txnCount: 0, volume: 0 }; }
    const row = Array.isArray(data) ? data[0] : data;
    return { txnCount: num(row?.txn_count), volume: num(row?.volume) };
}

/** Counts today as an active day and updates the streak. */
async function touch(userId: string): Promise<{ streak: number; best: number; days: number }> {
    const today = lusakaDay();
    const { data: row } = await supabase.from('user_progress').select('streak, best_streak, active_days, last_active').eq('user_id', userId).maybeSingle();
    const next = nextStreak({ streak: num(row?.streak), best: num(row?.best_streak), days: num(row?.active_days), last: row?.last_active ?? null }, today);
    if (next.changed) {
        await supabase.from('user_progress').upsert({ user_id: userId, streak: next.streak, best_streak: next.best, active_days: next.days, last_active: today, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    }
    return { streak: next.streak, best: next.best, days: next.days };
}

/** Records badges; returns only the ones that were new (a badge is earned once). Gold and platinum badges also gift points. */
async function award(userId: string, badges: Badge[]): Promise<Badge[]> {
    const fresh: Badge[] = [];
    for (const b of badges) {
        const { data, error } = await supabase.from('user_badges').upsert({ user_id: userId, badge_id: b.id, tier: b.tier, xp: b.xp }, { onConflict: 'user_id,badge_id', ignoreDuplicates: true }).select('badge_id');
        if (error) { console.error('[Progress] award failed:', error.message); continue; }
        if ((data ?? []).length > 0) {
            fresh.push(b);
            if (GIFT_POINTS[b.tier] > 0) {
                // The ref makes the gift happen once even if two requests race.
                await supabase.from('user_points_ledger').upsert({ user_id: userId, kind: 'GIFT', points: GIFT_POINTS[b.tier], reason: `Gift for the ${b.name} badge`, ref: `gift:${b.id}` }, { onConflict: 'user_id,ref', ignoreDuplicates: true });
            }
        }
    }
    return fresh;
}

export type ProgressEvent = { type: 'visit'; path: string } | { type: 'mission'; id: string };

/** Everything the apps show: level, XP, points, credit, streak and every badge with whether it is earned and how close the person is. */
export async function snapshot(userId: string, orgId: string | null) {
    const [{ data: earned }, { data: prog }, { data: ledger }, money] = await Promise.all([
        supabase.from('user_badges').select('badge_id, tier, xp, earned_at').eq('user_id', userId),
        supabase.from('user_progress').select('streak, best_streak, active_days, last_active').eq('user_id', userId).maybeSingle(),
        supabase.from('user_points_ledger').select('kind, points, xp_spent, credit, reason, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
        moneyStats(orgId),
    ]);
    const earnedMap = new Map((earned ?? []).map((e: any) => [e.badge_id, e]));
    const xp = (earned ?? []).reduce((s: number, e: any) => s + num(e.xp), 0);
    const spentXp = (ledger ?? []).reduce((s: number, l: any) => s + num(l.xp_spent), 0);
    const monthNow = lusakaDay().slice(0, 7);
    const convertedThisMonth = (ledger ?? []).some((l: any) => l.kind === 'CONVERT' && lusakaDay(new Date(l.created_at)).slice(0, 7) === monthNow);
    const points = (ledger ?? []).reduce((s: number, l: any) => s + num(l.points), 0);
    const credit = Math.round((ledger ?? []).reduce((s: number, l: any) => s + num(l.credit), 0) * 100) / 100;
    // A streak that has lapsed (last activity before yesterday) no longer counts as current.
    const today = lusakaDay();
    const live = prog?.last_active === today || prog?.last_active === dayBefore(today);
    const streakNow = live ? num(prog?.streak) : 0;
    const progressOf = (b: Badge): { have: number; need: number } | null =>
        b.rule.type === 'streak' ? { have: Math.min(streakNow, b.rule.days), need: b.rule.days }
        : b.rule.type === 'txn_count' ? { have: Math.min(money.txnCount, b.rule.n), need: b.rule.n }
        : b.rule.type === 'volume' ? { have: Math.min(Math.round(money.volume), b.rule.amount), need: b.rule.amount } : null;
    return {
        level: levelFor(xp),
        xp,
        convertibleXp: Math.max(0, xp - spentXp),
        convertedThisMonth,
        nextConvertOn: convertedThisMonth ? firstOfNextMonth() : null,
        points,
        credit,
        streak: { current: streakNow, best: num(prog?.best_streak), activeDays: num(prog?.active_days) },
        money,
        rates: { xpPerPoint: XP_PER_POINT, pointsPerKwacha: POINTS_PER_KWACHA, giftPoints: GIFT_POINTS },
        badges: CATALOGUE.map((b) => ({ id: b.id, name: b.name, description: b.description, tier: b.tier, xp: b.xp, family: b.family, earned: earnedMap.has(b.id), earnedAt: earnedMap.get(b.id)?.earned_at ?? null, progress: progressOf(b), gift: GIFT_POINTS[b.tier] })),
        history: (ledger ?? []).slice(0, 20),
    };
}

/** Counts the day, applies an event (a page opened, a mission finished), awards whatever that and the person's numbers earn, and returns the new picture. */
export async function record(userId: string, orgId: string | null, event?: ProgressEvent) {
    const s = await touch(userId);
    const money = await moneyStats(orgId);
    const earnedNow: Badge[] = badgesFromStats({ streak: s.streak, txnCount: money.txnCount, volume: money.volume });
    if (event?.type === 'visit') earnedNow.push(...visitBadgesFor(String(event.path ?? '')));
    if (event?.type === 'mission') {
        const b = BY_ID.get(String(event.id ?? ''));
        if (!b || b.rule.type !== 'mission') throw new ProgressError('Unknown mission.', 400, 'BAD_MISSION');
        earnedNow.push(b);
    }
    const fresh = await award(userId, earnedNow);
    return { newlyEarned: fresh.map((b) => ({ id: b.id, name: b.name, tier: b.tier, xp: b.xp, gift: GIFT_POINTS[b.tier] })), ...(await snapshot(userId, orgId)) };
}

/** Turns XP into points (XP_PER_POINT XP each), once a calendar month. Done in the database under a lock so two taps can't spend the same XP twice. */
export async function convertXp(userId: string, xp: number) {
    const amount = Math.floor(Number(xp));
    if (!Number.isFinite(amount) || amount <= 0 || amount % XP_PER_POINT !== 0) throw new ProgressError(`Convert a multiple of ${XP_PER_POINT} XP.`, 400, 'BAD_AMOUNT');
    // (the once-a-month rule is enforced in the database)
    const { data: earned } = await supabase.from('user_badges').select('xp').eq('user_id', userId);
    const total = (earned ?? []).reduce((s: number, e: any) => s + num(e.xp), 0);
    const { error } = await supabase.rpc('progress_convert', { p_user: userId, p_xp: amount, p_xp_per_point: XP_PER_POINT, p_xp_earned: total });
    if (error) throw new ProgressError(/ALREADY_CONVERTED_THIS_MONTH/.test(error.message) ? `You can convert XP once a month. You can convert again from ${firstOfNextMonth()}.` : /NOT_ENOUGH_XP/.test(error.message) ? 'You don’t have that much XP to convert.' : /BAD_AMOUNT/.test(error.message) ? 'That amount can’t be converted.' : error.message, 409, 'CONVERT');
    return { converted: amount, points: amount / XP_PER_POINT };
}

/** Turns points into fee credit (POINTS_PER_KWACHA points = K1), in whole kwacha, under the same lock. */
export async function redeemPoints(userId: string, points: number) {
    const n = Math.floor(Number(points));
    if (!Number.isFinite(n) || n <= 0 || n % POINTS_PER_KWACHA !== 0) throw new ProgressError(`Redeem a multiple of ${POINTS_PER_KWACHA} points (${POINTS_PER_KWACHA} points = K1).`, 400, 'BAD_AMOUNT');
    const credit = n / POINTS_PER_KWACHA;
    const { error } = await supabase.rpc('progress_redeem', { p_user: userId, p_points: n, p_credit: credit });
    if (error) throw new ProgressError(/NOT_ENOUGH_POINTS/.test(error.message) ? 'You don’t have that many points.' : /BAD_AMOUNT/.test(error.message) ? 'That amount can’t be redeemed.' : error.message, 409, 'REDEEM');
    return { redeemed: n, credit };
}

/** Fee credit the person has now (kwacha). */
export async function creditBalance(userId: string): Promise<number> {
    const { data } = await supabase.from('user_points_ledger').select('credit').eq('user_id', userId);
    return Math.round((data ?? []).reduce((s: number, l: any) => s + num(l.credit), 0) * 100) / 100;
}

/** Uses fee credit toward a charge MoneyWise sets itself. `ref` makes the same use happen once. Throws ProgressError('CREDIT') if the balance is too small. */
export async function spendCredit(userId: string, amount: number, ref: string, reason: string) {
    const a = Math.round(Number(amount) * 100) / 100;
    if (!(a > 0)) throw new ProgressError('Nothing to use.', 400, 'BAD_AMOUNT');
    const { error } = await supabase.rpc('progress_spend_credit', { p_user: userId, p_amount: a, p_ref: ref, p_reason: reason.slice(0, 120) });
    if (error) throw new ProgressError(/NOT_ENOUGH_CREDIT/.test(error.message) ? 'You don’t have that much fee credit.' : error.message, 409, 'CREDIT');
    return a;
}

/** Gives fee credit back (once per `ref`): a charge that was cancelled, rejected or failed. */
export async function restoreCredit(userId: string, amount: number, ref: string, reason: string) {
    const a = Math.round(Number(amount) * 100) / 100;
    if (!(a > 0)) return 0;
    const { error } = await supabase.rpc('progress_restore_credit', { p_user: userId, p_amount: a, p_ref: ref, p_reason: reason.slice(0, 120) });
    if (error) { console.error('[Progress] restore credit failed:', error.message); throw new ProgressError('Couldn’t return the fee credit.', 500, 'RESTORE'); }
    return a;
}

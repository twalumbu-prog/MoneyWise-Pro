/**
 * Badges, streak, XP, points and fee credit. The rules are checked as pure functions, then the real service runs against the live database with a
 * throwaway person and business, all removed at the end.
 * Run: npx tsx src/scripts/test_progress.ts
 */
import { randomUUID } from 'crypto';
import { supabase } from '../lib/supabase';
import * as P from '../services/progress.service';

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const rejects = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e: any) { return e; } };

(async () => {
    // ── the catalogue
    const ids = P.CATALOGUE.map((b) => b.id);
    check('badge ids are unique', new Set(ids).size === ids.length);
    check('all four tiers are used', (['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const).every((t) => P.CATALOGUE.some((b) => b.tier === t)));
    check('every family has a bronze way in (easy to reach)', (['EXPLORE', 'CONSISTENCY', 'MONEY'] as const).every((f) => P.CATALOGUE.some((b) => b.family === f && b.tier === 'BRONZE')));
    check('higher tiers are worth more XP than lower ones in the same family', (['CONSISTENCY', 'MONEY'] as const).every((f) => { const xs = (['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const).map((t) => P.CATALOGUE.find((b) => b.family === f && b.tier === t)?.xp ?? 0); return xs.every((x, i) => i === 0 || x > xs[i - 1]); }));
    check('only gold and platinum gift points, platinum the most', P.GIFT_POINTS.BRONZE === 0 && P.GIFT_POINTS.SILVER === 0 && P.GIFT_POINTS.GOLD > 0 && P.GIFT_POINTS.PLATINUM > P.GIFT_POINTS.GOLD);

    // ── pure rules
    check('opening / earns Welcome Aboard; /requisitions too', P.visitBadgesFor('/').map((b) => b.id).join() === 'visit_home' && P.visitBadgesFor('/requisitions').map((b) => b.id).join() === 'visit_home');
    check('a page under a badge page counts, a lookalike does not, a public page earns nothing', P.visitBadgesFor('/settings/team').length === 1 && P.visitBadgesFor('/settingsx').length === 0 && P.visitBadgesFor('/acme/store').length === 0 && P.visitBadgesFor('/pl/abc').length === 0);
    check('a query string and trailing slash are ignored', P.visitBadgesFor('/budgets/?x=1').map((b) => b.id).join() === 'visit_budgets');
    check('streak: same day changes nothing; next day adds one; a gap starts again',
        !P.nextStreak({ streak: 4, best: 6, days: 9, last: '2026-11-19' }, '2026-11-19').changed
        && P.nextStreak({ streak: 4, best: 6, days: 9, last: '2026-11-18' }, '2026-11-19').streak === 5
        && P.nextStreak({ streak: 4, best: 6, days: 9, last: '2026-11-17' }, '2026-11-19').streak === 1
        && P.nextStreak({ streak: 6, best: 6, days: 9, last: '2026-11-18' }, '2026-11-19').best === 7);
    check('streak across a month end', P.nextStreak({ streak: 2, best: 2, days: 2, last: '2026-11-30' }, '2026-12-01').streak === 3);
    check('stats earn the right badges (7-day streak, 12 entries, K12,000)', P.badgesFromStats({ streak: 7, txnCount: 12, volume: 12_000 }).map((b) => b.id).sort().join() === ['streak_3', 'streak_7', 'txn_1', 'txn_10', 'vol_10k', 'vol_1k'].sort().join());
    check('nothing at zero', P.badgesFromStats({ streak: 0, txnCount: 0, volume: 0 }).length === 0);
    check('levels: 0 XP is level 1, 50 is level 2, with the gap to the next', P.levelFor(0).level === 1 && P.levelFor(50).level === 2 && P.levelFor(60).toNext === 90);
    check('Lusaka day is two hours ahead of UTC', P.lusakaDay(new Date('2026-11-19T22:30:00Z')) === '2026-11-20' && P.lusakaDay(new Date('2026-11-19T21:30:00Z')) === '2026-11-19');

    // ── the real service
    const user = randomUUID();
    let org = '';
    try {
        const { data: o, error } = await supabase.from('organizations').insert({ name: `ZZ TEST progress ${randomUUID().slice(0, 6)}`, slug: `zz-test-progress-${randomUUID().slice(0, 6)}` }).select('id').single();
        if (error) throw error; org = o.id;
        const entry = (debit: number, credit: number, status: string) => ({ organization_id: org, entry_type: debit ? 'INFLOW' : 'DISBURSEMENT', account_type: 'MONEYWISE_WALLET', description: 'ZZ progress test', debit, credit, balance_after: 0, date: '2026-11-19', status });

        const first = await P.record(user, org);
        check('first use: the streak starts at 1 and nothing money-related is earned', first.streak.current === 1 && first.money.txnCount === 0 && first.badges.filter((b) => b.earned).length === 0, JSON.stringify(first.streak));

        const home = await P.record(user, org, { type: 'visit', path: '/' });
        check('opening home earns Welcome Aboard once, with its XP', home.newlyEarned.length === 1 && home.newlyEarned[0].id === 'visit_home' && home.xp === 10, JSON.stringify(home.newlyEarned));
        const again = await P.record(user, org, { type: 'visit', path: '/' });
        check('opening it again earns nothing more', again.newlyEarned.length === 0 && again.xp === 10);
        const m = await P.record(user, org, { type: 'mission', id: 'schedule_payment' });
        check('finishing a mission earns its badge, and a GOLD badge gifts points', m.newlyEarned[0]?.id === 'schedule_payment' && m.xp === 210 && m.points === P.GIFT_POINTS.GOLD, JSON.stringify({ xp: m.xp, points: m.points }));
        check('an unknown mission is refused', ((await rejects(() => P.record(user, org, { type: 'mission', id: 'visit_home' }))) as any)?.code === 'BAD_MISSION');

        // money movement comes from the real ledger: pending and unconfirmed entries don't count
        const ins = await supabase.from('cashbook_entries').insert([entry(500, 0, 'COMPLETED'), entry(0, 700, 'ACCOUNTED'), entry(9_000, 0, 'PENDING'), { ...entry(4_000, 0, 'COMPLETED'), entry_type: 'OPENING_BALANCE' }]);
        if (ins.error) throw new Error('could not insert ledger rows: ' + ins.error.message);
        const money = await P.record(user, org);
        check('confirmed entries count (2 entries, K1,200); a pending one and an opening balance do not', money.money.txnCount === 2 && money.money.volume === 1200, JSON.stringify(money.money));
        check('First Move and First Thousand are earned', money.badges.find((b) => b.id === 'txn_1')?.earned === true && money.badges.find((b) => b.id === 'vol_1k')?.earned === true);
        check('progress toward the next one is shown (2 of 10 entries)', JSON.stringify(money.badges.find((b) => b.id === 'txn_10')?.progress) === '{"have":2,"need":10}');

        // converting XP to points: 20 XP = 1 point, once a calendar month
        const before = await P.snapshot(user, org);
        check('rates: 20 XP = 1 point, 10 points = K1', P.XP_PER_POINT === 20 && P.POINTS_PER_KWACHA === 10 && P.POINT_VALUE_K === 0.1);
        check('XP is the sum of the badges, and all of it can be converted', before.xp === before.convertibleXp && before.xp > 0 && before.convertedThisMonth === false, `${before.xp}/${before.convertibleXp}`);
        check('converting a non-multiple of 20, zero, negative or too much is refused', ((await rejects(() => P.convertXp(user, 30))) as any)?.code === 'BAD_AMOUNT' && ((await rejects(() => P.convertXp(user, 0))) as any)?.code === 'BAD_AMOUNT' && ((await rejects(() => P.convertXp(user, -20))) as any)?.code === 'BAD_AMOUNT' && ((await rejects(() => P.convertXp(user, Math.ceil((before.convertibleXp + 20) / 20) * 20))) as any)?.code === 'CONVERT');
        const conv = await P.convertXp(user, 100);
        const afterConv = await P.snapshot(user, org);
        check('100 XP becomes 5 points; the XP is spent but the level stays', conv.points === 5 && afterConv.points === before.points + 5 && afterConv.convertibleXp === before.convertibleXp - 100 && afterConv.xp === before.xp, JSON.stringify({ p: afterConv.points, c: afterConv.convertibleXp }));
        check('the snapshot says it was converted this month and when it opens again (the 1st of next month)', afterConv.convertedThisMonth === true && /^\d{4}-\d{2}-01$/.test(String(afterConv.nextConvertOn)), String(afterConv.nextConvertOn));
        const second = (await rejects(() => P.convertXp(user, 20))) as any;
        check('a second conversion in the same month is refused, with the date it opens again', second?.code === 'CONVERT' && /once a month/.test(second.message), String(second?.message));

        // two taps at once can't spend the same XP twice (a second person, whose month is untouched)
        const user2 = randomUUID();
        try {
            await P.record(user2, null, { type: 'mission', id: 'schedule_payment' });
            const race = await Promise.all([P.convertXp(user2, 200).then(() => 'ok', () => 'refused'), P.convertXp(user2, 200).then(() => 'ok', () => 'refused')]);
            check('two simultaneous conversions of all the XP: exactly one succeeds', race.filter((r) => r === 'ok').length === 1 && (await P.snapshot(user2, null)).points === 5 + 10, race.join());

            // points to fee credit: user2 now has 15 points
            const raceR = await Promise.all([P.redeemPoints(user2, 10).then(() => 'ok', () => 'refused'), P.redeemPoints(user2, 10).then(() => 'ok', () => 'refused')]);
            const s2 = await P.snapshot(user2, null);
            check('two simultaneous redemptions of 10 of 15 points: exactly one succeeds; K1 credit, 5 points left', raceR.filter((r) => r === 'ok').length === 1 && s2.credit === 1 && s2.points === 5, `${raceR.join()} ${s2.credit} ${s2.points}`);
        } finally {
            await supabase.from('user_points_ledger').delete().eq('user_id', user2);
            await supabase.from('user_badges').delete().eq('user_id', user2);
            await supabase.from('user_progress').delete().eq('user_id', user2);
        }

        const pts = (await P.snapshot(user, org)).points;   // 10: a gold gift (5) + converted (5)
        check('redeeming a number of points that is not a multiple of 10, zero, or more than the balance is refused', ((await rejects(() => P.redeemPoints(user, 5))) as any)?.code === 'BAD_AMOUNT' && ((await rejects(() => P.redeemPoints(user, 0))) as any)?.code === 'BAD_AMOUNT' && ((await rejects(() => P.redeemPoints(user, pts + 10))) as any)?.code === 'REDEEM');
        const red = await P.redeemPoints(user, 10);
        const afterRed = await P.snapshot(user, org);
        check('10 points become K1 of fee credit', red.credit === 1 && afterRed.credit === 1 && afterRed.points === pts - 10, JSON.stringify({ credit: afterRed.credit, points: afterRed.points }));
        check('the history lists what happened', afterRed.history.length >= 3);

        // fee credit used on a MoneyWise charge (ads): atomic, once per reference, and returned once
        const bal0 = await P.creditBalance(user);
        check('the credit balance is what was redeemed (K1)', bal0 === 1, String(bal0));
        const sp = await P.spendCredit(user, 0.4, 'ad:test1', 'test');
        check('using K0.40 of credit lowers the balance by K0.40', sp === 0.4 && (await P.creditBalance(user)) === 0.6);
        await P.spendCredit(user, 0.4, 'ad:test1', 'test');
        check('repeating the same use (a retry) does not take it twice', (await P.creditBalance(user)) === 0.6);
        check('using more than the balance, or nothing, is refused', ((await rejects(() => P.spendCredit(user, 5, 'ad:test2', 'test'))) as any)?.code === 'CREDIT' && ((await rejects(() => P.spendCredit(user, 0, 'ad:test3', 'test'))) as any)?.code === 'BAD_AMOUNT' && (await P.creditBalance(user)) === 0.6);
        const raceC = await Promise.all([P.spendCredit(user, 0.6, 'ad:r1', 't').then(() => 'ok', () => 'refused'), P.spendCredit(user, 0.6, 'ad:r2', 't').then(() => 'ok', () => 'refused')]);
        check('two simultaneous uses of all the credit: exactly one succeeds, never below zero', raceC.filter((r) => r === 'ok').length === 1 && (await P.creditBalance(user)) === 0, raceC.join());
        await P.restoreCredit(user, 0.4, 'restore:ad:test1', 'test');
        await P.restoreCredit(user, 0.4, 'restore:ad:test1', 'test');
        check('returned credit comes back once, however many times it is asked', (await P.creditBalance(user)) === 0.4);
    } catch (e: any) {
        console.log('ERROR:', e?.stack ?? e?.message ?? JSON.stringify(e)); failed++;
    } finally {
        await supabase.from('user_points_ledger').delete().eq('user_id', user);
        await supabase.from('user_badges').delete().eq('user_id', user);
        await supabase.from('user_progress').delete().eq('user_id', user);
        if (org) {
            await supabase.from('cashbook_entries').delete().eq('organization_id', org);
            const { error: delErr } = await supabase.from('organizations').delete().eq('id', org);
            const { count } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).like('name', 'ZZ TEST progress %');
            console.log(`cleanup: ${count ?? 0} test businesses left${delErr ? ` (${delErr.message.slice(0, 80)})` : ''}`);
        }
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();

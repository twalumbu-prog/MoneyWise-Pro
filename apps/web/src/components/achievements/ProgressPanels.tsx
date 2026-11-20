import React, { useEffect, useState } from 'react';
import { Award, Flame, Gift, Lock, Sparkles, Zap } from 'lucide-react';
import { TIER_STYLE } from 'core';
import { useAchievements } from '../../context/AchievementsContext';
import type { ServerBadge } from '../../context/AchievementsContext';

const FAMILY_LABEL: Record<ServerBadge['family'], string> = { EXPLORE: 'Look around', MISSION: 'Guided missions', CONSISTENCY: 'Consistent use', MONEY: 'Money movement' };
const FAMILY_ORDER: ServerBadge['family'][] = ['CONSISTENCY', 'MONEY', 'MISSION', 'EXPLORE'];
const TIER_ORDER = { BRONZE: 0, SILVER: 1, GOLD: 2, PLATINUM: 3 } as const;
const kwacha = (n: number) => `K${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** One badge: the tier's colour when earned, grey and locked when not, with a progress bar toward the ones that count something. */
const BadgeTile: React.FC<{ b: ServerBadge }> = ({ b }) => {
    const t = TIER_STYLE[b.tier];
    const pct = b.progress ? Math.round((b.progress.have / b.progress.need) * 100) : 0;
    return (
        <div className={`rounded-2xl border p-3 text-center ${b.earned ? 'bg-white shadow-sm' : 'border-gray-100 bg-gray-50'}`} style={b.earned ? { borderColor: t.color } : undefined} title={b.description}>
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-sm" style={{ backgroundColor: b.earned ? t.color : '#C4C7C5' }}>
                {b.earned ? <Award size={20} /> : <Lock size={17} />}
            </div>
            <h5 className={`truncate text-xs font-bold ${b.earned ? 'text-gray-900' : 'text-gray-500'}`}>{b.name}</h5>
            <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ backgroundColor: b.earned ? t.soft : '#EDEDED', color: b.earned ? t.ink : '#80868B' }}>{t.label}</span>
            {!b.earned && b.progress && (
                <div className="mt-2">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: t.color }} /></div>
                    <p className="mt-1 text-[9px] font-semibold text-gray-400">{b.progress.have.toLocaleString()} / {b.progress.need.toLocaleString()}</p>
                </div>
            )}
            {!b.earned && !b.progress && <p className="mt-1.5 text-[9px] font-semibold text-gray-400">+{b.xp} XP</p>}
            {b.gift > 0 && <p className="mt-1 flex items-center justify-center gap-0.5 text-[9px] font-bold" style={{ color: t.ink }}><Gift size={10} /> {b.earned ? 'Gift received' : `Gift: ${b.gift} points`}</p>}
        </div>
    );
};

/** Every badge, grouped by what it rewards, lowest tier first within each group. */
export const BadgeGallery: React.FC = () => {
    const { progress } = useAchievements();
    if (!progress) return <p className="py-8 text-center text-xs font-semibold text-gray-400">Loading your badges…</p>;
    const earned = progress.badges.filter((b) => b.earned).length;
    return (
        <div className="space-y-5">
            <p className="text-[11px] font-semibold text-gray-500">{earned} of {progress.badges.length} badges earned. Gold and platinum badges come with a gift of points.</p>
            {FAMILY_ORDER.map((f) => {
                const list = progress.badges.filter((b) => b.family === f).sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
                return (
                    <div key={f}>
                        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">{FAMILY_LABEL[f]}</h4>
                        <div className="grid grid-cols-2 gap-2.5">{list.map((b) => <BadgeTile key={b.id} b={b} />)}</div>
                    </div>
                );
            })}
        </div>
    );
};

/** Level, XP, the daily streak, points, fee credit, and the two conversions (XP to points, points to fee credit). */
export const RewardsTab: React.FC = () => {
    const { progress, refreshProgress, convertXp, redeemPoints } = useAchievements();
    // Always show the server's current numbers and rates when this tab opens (a tab left open can hold an older answer).
    useEffect(() => { void refreshProgress(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    if (!progress) return <p className="py-8 text-center text-xs font-semibold text-gray-400">Loading your progress…</p>;
    const { level } = progress;
    const rates = { xpPerPoint: progress.rates?.xpPerPoint ?? 20, pointsPerKwacha: (progress.rates as any)?.pointsPerKwacha ?? 10 };
    const pct = level.nextAt ? Math.min(100, Math.round(((level.xp - level.thisAt) / (level.nextAt - level.thisAt)) * 100)) : 100;
    const convertible = progress.convertibleXp - (progress.convertibleXp % rates.xpPerPoint);
    const canConvert = !progress.convertedThisMonth && convertible >= rates.xpPerPoint;
    // Points are redeemed in whole kwacha (10 points = K1).
    const redeemable = progress.points - (progress.points % rates.pointsPerKwacha);
    const redeemK = redeemable / rates.pointsPerKwacha;
    const run = async (fn: () => Promise<void>, ok: string) => {
        setBusy(true); setMsg(null);
        try { await fn(); setMsg({ ok: true, text: ok }); } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.error || e?.message || 'That did not work. Please try again.' }); } finally { setBusy(false); }
    };
    return (
        <div className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-[#0B57D0] to-[#4F46E5] p-4 text-white">
                <div className="flex items-baseline justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-white/80">Level {level.level}</span>
                    <span className="text-xs font-semibold text-white/80">{progress.xp} XP</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} /></div>
                <p className="mt-1.5 text-[11px] font-semibold text-white/85">{level.nextAt ? `${level.toNext} XP to level ${level.level + 1}` : 'Top level reached'}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl border border-gray-100 p-3"><Flame size={16} className="mx-auto text-orange-500" /><p className="mt-1 text-lg font-bold text-gray-900">{progress.streak.current}</p><p className="text-[10px] font-semibold text-gray-400">day streak</p></div>
                <div className="rounded-2xl border border-gray-100 p-3"><Sparkles size={16} className="mx-auto text-amber-500" /><p className="mt-1 text-lg font-bold text-gray-900">{progress.points}</p><p className="text-[10px] font-semibold text-gray-400">points</p></div>
                <div className="rounded-2xl border border-gray-100 p-3"><Gift size={16} className="mx-auto text-emerald-600" /><p className="mt-1 text-lg font-bold text-gray-900">{kwacha(progress.credit)}</p><p className="text-[10px] font-semibold text-gray-400">fee credit</p></div>
            </div>
            <p className="text-[11px] text-gray-500">Best streak {progress.streak.best} days. Use MoneyWise Pro every day to keep it going.</p>

            <div className="rounded-2xl border border-gray-100 p-4">
                <h4 className="flex items-center gap-1.5 text-xs font-bold text-gray-900"><Zap size={13} className="text-emerald-600" /> Turn XP into points</h4>
                <p className="mt-1 text-[11px] text-gray-500">{rates.xpPerPoint} XP = 1 point, and you can convert once a month. Your level stays the same.</p>
                <button disabled={busy || !canConvert} onClick={() => run(() => convertXp(convertible), `Converted ${convertible} XP into ${convertible / rates.xpPerPoint} points.`)}
                    className="mt-3 w-full rounded-xl bg-[#0B57D0] py-2.5 text-xs font-bold text-white transition hover:bg-[#0842A0] disabled:opacity-40">
                    {progress.convertedThisMonth ? `Converted this month. Next: ${progress.nextConvertOn}` : convertible >= rates.xpPerPoint ? `Convert ${convertible} XP to ${convertible / rates.xpPerPoint} points` : 'No XP to convert yet'}
                </button>
            </div>

            <div className="rounded-2xl border border-gray-100 p-4">
                <h4 className="flex items-center gap-1.5 text-xs font-bold text-gray-900"><Gift size={13} className="text-emerald-600" /> Points to fee credit</h4>
                <p className="mt-1 text-[11px] text-gray-500">{rates.pointsPerKwacha} points = K1 of fee credit, in whole kwacha.</p>
                <button disabled={busy || redeemable < 1} onClick={() => run(() => redeemPoints(redeemable), `Added ${kwacha(redeemK)} of fee credit.`)}
                    className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                    {redeemable >= 1 ? `Redeem ${redeemable} points for ${kwacha(redeemK)}` : `Need ${rates.pointsPerKwacha} points to redeem`}
                </button>
                <p className="mt-2 text-[10px] text-gray-400">Use your credit when you buy a Marketplace ad: it takes that much off the price. It can’t reduce Lipila or Lenco fees, because they charge those themselves.</p>
            </div>
            {msg && <p className={`rounded-xl px-3 py-2 text-xs font-semibold ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>{msg.text}</p>}
        </div>
    );
};

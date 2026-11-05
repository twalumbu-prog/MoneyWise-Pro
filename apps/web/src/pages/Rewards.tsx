import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, Gift, Loader2, Star, Medal, Ticket, Copy, Check, Trophy } from 'lucide-react';
import { rewardsService, type PurchaseClaim, type RewardCard, type RewardDetail, type RewardsOverview } from 'core';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { claimPendingPurchases, hasPendingClaims, REWARDS_SIGNUP_KEY } from '../lib/rewardClaims';
import { RewardsProgress, ProgrammeLogo, fmtPoints } from '../components/rewards/RewardsUI';
import { RewardOptionRow } from '../components/rewards/StoreRewardsSection';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const isActive = (uo: any) => uo.status === 'ACTIVE' || !uo.status;

const ProgressFoot: React.FC<{ card: RewardCard }> = ({ card }) => (
    <div className="mt-2 flex justify-between gap-3 text-[12px] font-bold text-[#737373]">
        <span className="truncate">{card.rewardReady ? `${card.rewardTitle} is ready to redeem` : `${fmtPoints(card.pointsToNext ?? 0)} points to ${card.rewardTitle}`}</span>
        <span>{Math.round(card.progress * 100)}%</span>
    </div>
);

/** One programme in the list: logo, name, member status and progress to the next reward (mirrors the app's RewardCardRow). */
const ProgrammeRow: React.FC<{ card: RewardCard; onOpen: () => void }> = ({ card, onOpen }) => (
    <button type="button" onClick={onOpen} className="w-full text-left py-4 first:pt-1 last:pb-1 group">
        <div className="flex items-center gap-3">
            <ProgrammeLogo card={card} size={40} />
            <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-black truncate">{card.name}</p>
                <p className="text-[12px] text-zinc-500 truncate">{card.status} · {fmtPoints(card.balance)} pts</p>
            </div>
            <ChevronRight size={18} className="text-black transition-transform group-hover:translate-x-0.5" />
        </div>
        {card.threshold ? (
            <div className="mt-3"><RewardsProgress progress={card.progress} /><ProgressFoot card={card} /></div>
        ) : (
            <div className="mt-2 flex justify-between text-[12px] font-bold text-[#737373]"><span>Earned by inviting friends</span><span>{fmtPoints(card.balance)} pts</span></div>
        )}
    </button>
);

/** One programme: balance, progress, rewards to redeem (with vouchers) and how the points built up. */
const ProgrammeDetail: React.FC<{ scope: string }> = ({ scope }) => {
    const qc = useQueryClient();
    const [redeeming, setRedeeming] = useState<string | null>(null);
    const [voucher, setVoucher] = useState<{ code: string; title: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const { data, isLoading, isError, refetch } = useQuery<RewardDetail>({ queryKey: ['rewards', 'detail', scope], queryFn: () => rewardsService.detail(scope), staleTime: 15_000 });

    if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#006AFF]" /></div>;
    if (isError || !data) return (
        <div className="text-center py-16">
            <p className="text-sm text-zinc-500">We couldn’t load these rewards.</p>
            <button onClick={() => refetch()} className="mt-3 px-4 py-2 rounded-full bg-[#EEF4FF] text-[#006AFF] text-xs font-bold">Try again</button>
        </div>
    );
    const { card } = data;

    const redeem = async (rewardId: string) => {
        setRedeeming(rewardId); setError(null);
        try {
            const r = await rewardsService.redeem(scope, rewardId);
            setVoucher({ code: r.code, title: r.title });
            await Promise.all([qc.invalidateQueries({ queryKey: ['rewards'] })]);
        } catch (e: any) { setError(e?.message || 'Couldn’t redeem this reward.'); }
        finally { setRedeeming(null); }
    };
    const copy = async (code: string) => {
        try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
    };
    const vouchers = data.achievements.filter((a) => a.kind === 'reward' && a.status === 'ISSUED' && a.code);

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                <div className="flex items-center gap-4">
                    <ProgrammeLogo card={card} size={56} />
                    <div className="min-w-0">
                        <p className="text-lg font-black text-slate-900 truncate">{card.name}</p>
                        <p className="text-[11px] font-bold tracking-wider text-[#006AFF]">{card.status.toUpperCase()}</p>
                        <p className="text-sm font-semibold text-zinc-600">{fmtPoints(card.balance)} points</p>
                    </div>
                </div>
                {card.threshold ? <div className="mt-5"><RewardsProgress progress={card.progress} /><ProgressFoot card={card} /></div> : null}
                {data.program && (
                    <p className="mt-4 text-[12px] text-zinc-500">
                        Earn {data.program.pointsPerKwacha} point{data.program.pointsPerKwacha === 1 ? '' : 's'} for every K1 you spend at {card.name}.
                    </p>
                )}
            </div>

            {(voucher || vouchers.length > 0) && (
                <div className="bg-white rounded-2xl border border-emerald-200 p-5">
                    <div className="flex items-center gap-2 mb-3"><Ticket size={15} className="text-emerald-700" /><span className="text-xs font-bold text-emerald-800">Ready to use — show the code at {card.name}</span></div>
                    <ul className="space-y-2">
                        {(voucher ? [{ id: 'new', title: voucher.title, code: voucher.code }] : []).concat(vouchers.filter((v) => v.code !== voucher?.code).map((v) => ({ id: v.id, title: v.title, code: v.code! }))).map((v) => (
                            <li key={v.id} className="flex items-center justify-between gap-3 bg-emerald-50 rounded-xl px-4 py-3">
                                <div className="min-w-0">
                                    <p className="text-[13px] font-bold text-slate-900 truncate">{v.title}</p>
                                    <p className="text-[15px] font-black tracking-widest text-emerald-800 font-mono">{v.code}</p>
                                </div>
                                <button onClick={() => copy(v.code)} className="p-2 rounded-lg hover:bg-emerald-100 text-emerald-800" aria-label="Copy code">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {data.rewards.length > 0 && (
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <div className="flex items-center gap-2 mb-3"><Gift size={15} className="text-slate-900" /><span className="text-xs font-bold text-zinc-600">Rewards</span></div>
                    {error && <p className="text-[12px] text-rose-600 mb-2">{error}</p>}
                    <ul className="divide-y divide-neutral-100">
                        {data.rewards.map((r) => (
                            <RewardOptionRow key={r.id} reward={r} action={r.affordable ? (
                                <button onClick={() => redeem(r.id)} disabled={!!redeeming} className="flex-shrink-0 px-3.5 py-1.5 rounded-full bg-[#006AFF] hover:bg-[#0052CC] text-white text-[11px] font-bold disabled:opacity-60">
                                    {redeeming === r.id ? <Loader2 size={12} className="animate-spin" /> : 'Redeem'}
                                </button>
                            ) : undefined} />
                        ))}
                    </ul>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                <div className="flex items-center gap-2 mb-3"><Trophy size={15} className="text-slate-900" /><span className="text-xs font-bold text-zinc-600">Points activity</span></div>
                {data.points.length === 0 ? (
                    <p className="text-[12px] text-zinc-400 py-3 text-center">Make a purchase at {card.name} to start earning points.</p>
                ) : (
                    <ul className="divide-y divide-neutral-100">
                        {data.points.map((p) => (
                            <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                <span className="w-9 h-9 rounded-full bg-[#EEF4FF] text-[#006AFF] flex items-center justify-center flex-shrink-0">{p.points < 0 ? <Gift size={15} /> : <Star size={15} />}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-slate-900 truncate">{p.description ?? 'Points'}</p>
                                    <p className="text-[11px] text-zinc-500">{day(p.at)}{p.amount ? ` · K${p.amount.toLocaleString('en-US')}` : ''}</p>
                                </div>
                                <span className={`text-[13px] font-bold tabular-nums ${p.points < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{p.points > 0 ? '+' : ''}{fmtPoints(p.points)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {data.achievements.some((a) => a.kind !== 'reward') && (
                <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                    <div className="flex items-center gap-2 mb-3"><Medal size={15} className="text-slate-900" /><span className="text-xs font-bold text-zinc-600">Achievements</span></div>
                    <ul className="space-y-3">
                        {data.achievements.filter((a) => a.kind !== 'reward').map((a) => (
                            <li key={a.id} className="flex items-center gap-3">
                                <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">{a.kind === 'tier' ? <Medal size={15} /> : <Star size={15} />}</span>
                                <div className="min-w-0"><p className="text-[13px] font-semibold text-slate-900">{a.title}</p><p className="text-[11px] text-zinc-500">{a.description} · {day(a.at)}</p></div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

/**
 * Rewards on the web. Also where "Sign up with Google to redeem your rewards" on a store's success screen lands: a brand-new
 * person gets a MoneyWise Personal account straight away, the purchase they just made is added, and they see their points.
 */
export const Rewards: React.FC = () => {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [params, setParams] = useSearchParams();
    const { organizationsLoaded, userOrganizations, refreshUserOrganizations, switchOrganization, userName } = useAuth();
    const scope = params.get('scope');
    const [settingUp, setSettingUp] = useState(false);
    const [setupError, setSetupError] = useState<string | null>(null);
    const [claimed, setClaimed] = useState<PurchaseClaim[]>([]);
    const [ready, setReady] = useState(false);
    const started = useRef(false);

    useEffect(() => {
        if (!organizationsLoaded || started.current) return;
        started.current = true;
        (async () => {
            let fromStore = false;
            try { fromStore = localStorage.getItem(REWARDS_SIGNUP_KEY) === '1'; localStorage.removeItem(REWARDS_SIGNUP_KEY); } catch { /* storage unavailable */ }
            // A new person from a store's rewards button: create their MoneyWise Personal account (no account-type step).
            if ((fromStore || hasPendingClaims()) && !userOrganizations.some(isActive)) {
                setSettingUp(true);
                try {
                    const res = await apiFetch('/auth/complete-social-signup', { method: 'POST', body: JSON.stringify({ accountType: 'INDIVIDUAL' }) });
                    const data = await res.json();
                    await refreshUserOrganizations();
                    if (data?.organizationId) await switchOrganization(data.organizationId).catch(() => undefined);
                } catch (e: any) {
                    setSetupError(e?.message || 'We couldn’t finish setting up your account.');
                }
                setSettingUp(false);
            }
            const results = await claimPendingPurchases().catch(() => []);
            setClaimed(results.filter((r) => !r.alreadyClaimed || params.get('welcome')));
            if (results.length) await qc.invalidateQueries({ queryKey: ['rewards'] });
            setReady(true);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [organizationsLoaded]);

    const { data: overview, isLoading, isError, refetch } = useQuery<RewardsOverview>({
        queryKey: ['rewards', 'overview'], queryFn: () => rewardsService.overview(), enabled: ready, staleTime: 15_000,
    });

    const open = (id: string | null) => {
        const next = new URLSearchParams(params);
        next.delete('welcome');
        if (id) next.set('scope', id); else next.delete('scope');
        setParams(next);
        window.scrollTo({ top: 0 });
    };
    const first = (userName || '').split(' ')[0];
    const welcome = params.get('welcome') === '1';
    const programmes = overview ? [...overview.businesses, ...(overview.platform.balance > 0 ? [overview.platform] : [])] : [];
    const totalPoints = overview ? overview.businesses.reduce((s, b) => s + Math.max(0, b.balance), 0) + Math.max(0, overview.platform.balance) : 0;

    return (
        <div className="min-h-screen bg-[#F9FAFB]">
            <div className="max-w-lg mx-auto px-4 pb-16">
                <header className="flex items-center justify-between pt-6 pb-5">
                    <button onClick={() => (scope ? open(null) : navigate('/'))} className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center hover:bg-gray-100" aria-label="Back">
                        <ArrowLeft size={22} className="text-slate-900" />
                    </button>
                    <h1 className="text-base font-bold text-slate-900">Rewards</h1>
                    <span className="w-10" />
                </header>

                {settingUp || !ready ? (
                    <div className="flex flex-col items-center justify-center text-center py-24">
                        <Loader2 className="h-7 w-7 animate-spin text-[#006AFF]" />
                        <p className="mt-4 text-sm font-semibold text-slate-700">{settingUp ? 'Setting up your MoneyWise Personal account…' : 'Loading your rewards…'}</p>
                    </div>
                ) : scope ? (
                    <ProgrammeDetail scope={scope} />
                ) : (
                    <div className="space-y-4">
                        {(welcome || claimed.length > 0) && (
                            <div className="relative overflow-hidden rounded-2xl border border-[#DCE7FF] bg-gradient-to-br from-[#EEF4FF] via-white to-white p-5">
                                <div>
                                    <div className="min-w-0">
                                        <p className="text-[15px] font-black text-slate-900">{welcome ? `Welcome to MoneyWise${first ? `, ${first}` : ''}` : 'Points added'}</p>
                                        <p className="text-[12px] text-zinc-600 mt-0.5">
                                            {claimed.length > 0
                                                ? claimed.map((c) => `${fmtPoints(c.pointsEarned)} points from ${c.card.name}`).join(' · ') + ' are now in your rewards.'
                                                : 'Your rewards live here. Every purchase you make on this browser keeps adding points.'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                        {setupError && <p className="text-[12px] text-rose-600 text-center">{setupError}</p>}

                        {isLoading ? (
                            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#006AFF]" /></div>
                        ) : isError || !overview ? (
                            <div className="text-center py-16">
                                <p className="text-sm text-zinc-500">We couldn’t load your rewards.</p>
                                <button onClick={() => refetch()} className="mt-3 px-4 py-2 rounded-full bg-[#EEF4FF] text-[#006AFF] text-xs font-bold">Try again</button>
                            </div>
                        ) : (
                            <>
                                <div className="bg-white rounded-2xl border border-neutral-200 px-5 py-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Total points</p>
                                        <p className="text-[28px] leading-tight font-black text-slate-900 tabular-nums">{fmtPoints(totalPoints)}</p>
                                    </div>
                                    <span className="text-[12px] font-semibold text-zinc-500">{overview.businesses.length} business{overview.businesses.length === 1 ? '' : 'es'}</span>
                                </div>
                                <div className="bg-white rounded-2xl border border-neutral-200 px-5 py-3">
                                    {programmes.length === 0 ? (
                                        <div className="text-center py-10">
                                            <Gift size={28} className="mx-auto text-[#006AFF]" />
                                            <p className="mt-3 text-sm font-semibold text-slate-800">No points yet</p>
                                            <p className="mt-1 text-[12px] text-zinc-500">Pay at a MoneyWise store while signed in and your points show up here.</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-neutral-100">
                                            {programmes.map((card) => <ProgrammeRow key={card.id} card={card} onOpen={() => open(card.id)} />)}
                                        </div>
                                    )}
                                </div>
                                <Link to="/" className="block text-center text-[12px] font-semibold text-zinc-500 hover:text-slate-800 pt-2">Go to my MoneyWise account</Link>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

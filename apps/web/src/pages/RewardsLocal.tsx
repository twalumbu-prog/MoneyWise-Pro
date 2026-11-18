import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Check, ChevronRight, Copy, Gift, Settings2, Sparkles, Ticket } from 'lucide-react';
import { formatKwacha, rewardsService } from 'core';
import type { RewardCard, RewardOption } from 'core';
import { PagePanel } from '../components/ui/PagePanel';
import { PlanTabs } from '../components/ui/PlanTabs';
import { Dialog, ErrorNote, PrimaryButton, ProgressBar, TonalButton } from '../components/ui/Dialog';

const TIER_STYLE: Record<RewardCard['tier'], string> = {
    Bronze: 'bg-[#FEEFC3] text-[#B06000]',
    Silver: 'bg-[#E8EAED] text-[#5F6368]',
    Gold: 'bg-[#FEF7E0] text-[#B06000]',
    Platinum: 'bg-[#E8F0FE] text-[#1967D2]',
};

const TierTag: React.FC<{ tier: RewardCard['tier'] }> = ({ tier }) => (
    <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${TIER_STYLE[tier]}`}>{tier}</span>
);

const CardLogo: React.FC<{ card: RewardCard; size?: number }> = ({ card, size = 44 }) => {
    const [broken, setBroken] = useState(false);
    if (card.logoUrl && !broken) return <img src={card.logoUrl} alt="" onError={() => setBroken(true)} style={{ width: size, height: size }} className="rounded-full bg-[#F1F3F4] object-cover" />;
    return (
        <span style={{ width: size, height: size }} className="flex flex-shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-sm font-bold text-[#0B57D0]">
            {card.isPlatform ? <Sparkles size={size * 0.45} /> : card.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
        </span>
    );
};

const useCopy = () => {
    const [copied, setCopied] = useState<string | null>(null);
    const copy = async (text: string, key = 'x') => {
        try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); } catch { /* clipboard unavailable */ }
    };
    return { copied, copy };
};

/** Rewards: the points a person earns with MoneyWise and with each business they buy from. The web twin of the Expo Rewards tab. */
export const Rewards: React.FC = () => {
    const navigate = useNavigate();
    const { copied, copy } = useCopy();
    const { data, isPending, isError, refetch } = useQuery({ queryKey: ['rewards', 'overview'], queryFn: () => rewardsService.overview() });
    const { data: redeem } = useQuery({ queryKey: ['rewards', 'redeemables'], queryFn: () => rewardsService.redeemables() });

    const cards = data ? [data.platform, ...data.businesses] : [];
    const vouchers = redeem?.vouchers ?? [];

    return (
        <PagePanel
            title="Plan"
            subtitle="Points you earn with MoneyWise and the businesses you buy from"
            tabs={<PlanTabs active="rewards" />}
            actions={<TonalButton onClick={() => navigate('/rewards/manage')}><Settings2 size={15} /> My business rewards</TonalButton>}
        >
            {isError ? (
                <div className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-8 text-center">
                    <p className="text-sm text-[#5F6368]">Couldn’t load your rewards.</p>
                    <TonalButton onClick={() => refetch()} className="mt-4">Try again</TonalButton>
                </div>
            ) : isPending ? (
                <p className="py-10 text-center text-sm text-[#80868B]">Loading…</p>
            ) : (
                <>
                    {data && (
                        <section className="mb-8 rounded-[28px] bg-gradient-to-br from-[#0B57D0] to-[#0842A0] p-6 text-white md:p-8">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">MoneyWise points</p>
                            <p className="mt-2 text-4xl font-bold leading-none tracking-tight tabular-nums md:text-[44px]">{data.platform.balance.toLocaleString()}</p>
                            <p className="mt-2 text-[11px] font-medium text-white/70">{data.platform.status} · {data.platform.lifetime.toLocaleString()} earned in total</p>
                            <div className="mt-6 flex flex-wrap items-center gap-3">
                                <span className="text-xs text-white/70">Your invite code</span>
                                <span className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold tracking-[0.2em]">{data.code}</span>
                                <button type="button" onClick={() => copy(data.code, 'code')} className="inline-flex items-center gap-1.5 rounded-full bg-[#D3E3FD] px-4 py-2 text-sm font-semibold text-[#041E49] hover:bg-[#C2D7FA]">
                                    {copied === 'code' ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                                </button>
                            </div>
                        </section>
                    )}

                    {vouchers.length > 0 && (
                        <section className="mb-8">
                            <h2 className="mb-3 text-sm font-bold text-[#1F1F1F]">Your vouchers</h2>
                            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                {vouchers.map((v) => (
                                    <li key={v.id} className="flex items-center gap-3 rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-4">
                                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#E6F4EA] text-[#137333]"><Ticket size={18} /></span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold text-[#1F1F1F]">{v.title}</span>
                                            <span className="block truncate text-xs text-[#5F6368]">{v.business}</span>
                                        </span>
                                        <button type="button" onClick={() => copy(v.code, v.id)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#D3E3FD] px-3 text-sm font-bold tracking-widest text-[#041E49] hover:bg-[#C2D7FA]" title="Copy code">
                                            {copied === v.id ? <Check size={14} /> : v.code}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    <h2 className="mb-3 text-sm font-bold text-[#1F1F1F]">Programmes</h2>
                    {data?.businesses.length === 0 && (
                        <p className="mb-4 rounded-2xl border border-dashed border-[#C4C7C5] px-5 py-8 text-center text-sm text-[#5F6368]">
                            Buy from a business that runs rewards and its points card will appear here.
                        </p>
                    )}
                    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {cards.map((c) => (
                            <li key={c.id}>
                                <button type="button" onClick={() => navigate(`/rewards/${encodeURIComponent(c.id)}`)} className="flex h-full w-full flex-col rounded-2xl border border-[rgba(116,119,117,0.22)] bg-white p-5 text-left transition hover:border-[#0B57D0]/40">
                                    <span className="flex items-center gap-3">
                                        <CardLogo card={c} />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-2"><span className="truncate text-sm font-bold text-[#1F1F1F]">{c.name}</span><TierTag tier={c.tier} /></span>
                                            <span className="block text-xs text-[#5F6368]">{c.balance.toLocaleString()} points</span>
                                        </span>
                                        <ChevronRight size={16} className="text-[#9AA0A6]" />
                                    </span>
                                    {c.threshold ? (
                                        <span className="mt-4 block">
                                            <ProgressBar value={c.progress} tone={c.rewardReady ? 'green' : 'blue'} />
                                            <span className={`mt-1.5 block text-xs ${c.rewardReady ? 'font-semibold text-[#137333]' : 'text-[#5F6368]'}`}>
                                                {c.rewardReady ? `${c.rewardTitle ?? 'A reward'} is ready to redeem` : `${(c.pointsToNext ?? 0).toLocaleString()} points to ${c.rewardTitle ?? 'your next reward'}`}
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="mt-4 block text-xs text-[#80868B]">Keep earning, rewards are coming.</span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </PagePanel>
    );
};

/** One programme: its points, what they can be redeemed for, history and the vouchers already issued. */
export const RewardsDetail: React.FC = () => {
    const { scope = '' } = useParams();
    const qc = useQueryClient();
    const { copied, copy } = useCopy();
    const [redeeming, setRedeeming] = useState<RewardOption | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [issued, setIssued] = useState<{ code: string; title: string; business: string } | null>(null);

    const { data, isPending, isError } = useQuery({ queryKey: ['rewards', 'detail', scope], queryFn: () => rewardsService.detail(scope), enabled: !!scope });

    const redeem = async (option: RewardOption) => {
        setBusy(true); setError(null);
        try {
            const r = await rewardsService.redeem(scope, option.id);
            setIssued({ code: r.code, title: r.title, business: r.business });
            setRedeeming(null);
            qc.invalidateQueries({ queryKey: ['rewards'] });
        } catch (e: any) {
            setError(e?.message || 'Could not redeem that. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const card = data?.card;
    return (
        <PagePanel title={card?.name ?? 'Rewards'} subtitle={card ? card.status : undefined} back="/rewards">
            {isPending ? (
                <p className="py-10 text-center text-sm text-[#80868B]">Loading…</p>
            ) : isError || !data || !card ? (
                <p className="py-10 text-center text-sm text-[#5F6368]">We couldn’t find that programme.</p>
            ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="flex flex-col gap-6 lg:col-span-2">
                        <section className="rounded-[28px] bg-gradient-to-br from-[#0B57D0] to-[#0842A0] p-6 text-white md:p-8">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">Points balance</p>
                            <p className="mt-2 text-4xl font-bold leading-none tracking-tight tabular-nums md:text-[44px]">{card.balance.toLocaleString()}</p>
                            {card.threshold ? (
                                <>
                                    <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white" style={{ width: `${Math.round(card.progress * 100)}%` }} /></div>
                                    <p className="mt-2 text-xs text-white/70">{card.rewardReady ? 'A reward is ready to redeem' : `${(card.pointsToNext ?? 0).toLocaleString()} points to ${card.rewardTitle ?? 'your next reward'}`}</p>
                                </>
                            ) : null}
                        </section>

                        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-5">
                            <h2 className="mb-3 text-sm font-bold text-[#1F1F1F]">Redeem your points</h2>
                            {data.rewards.length === 0 ? (
                                <p className="text-sm text-[#80868B]">{card.isPlatform ? 'MoneyWise rewards are coming soon.' : 'This business hasn’t added rewards yet.'}</p>
                            ) : (
                                <ul className="divide-y divide-[rgba(116,119,117,0.14)]">
                                    {data.rewards.map((r) => (
                                        <li key={r.id} className="flex items-center gap-3 py-3">
                                            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-[#0B57D0]"><Gift size={18} /></span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-semibold text-[#1F1F1F]">{r.title}</span>
                                                <span className="block truncate text-xs text-[#5F6368]">{r.points.toLocaleString()} points · {r.appliesTo}</span>
                                            </span>
                                            {r.affordable ? (
                                                <PrimaryButton onClick={() => { setError(null); setRedeeming(r); }} className="h-9 px-5">Redeem</PrimaryButton>
                                            ) : (
                                                <span className="text-xs text-[#80868B]">{r.pointsToGo.toLocaleString()} to go</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-5">
                            <h2 className="mb-3 text-sm font-bold text-[#1F1F1F]">Points history</h2>
                            {data.points.length === 0 ? (
                                <p className="text-sm text-[#80868B]">No points yet.</p>
                            ) : (
                                <ul className="divide-y divide-[rgba(116,119,117,0.14)]">
                                    {data.points.map((p) => (
                                        <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm text-[#1F1F1F]">{p.description || p.kind.charAt(0) + p.kind.slice(1).toLowerCase()}</span>
                                                <span className="block text-xs text-[#80868B]">{new Date(p.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}{p.amount ? ` · ${formatKwacha(p.amount)}` : ''}</span>
                                            </span>
                                            <span className={`text-sm font-semibold tabular-nums ${p.points >= 0 ? 'text-[#137333]' : 'text-[#1F1F1F]'}`}>{p.points >= 0 ? '+' : ''}{p.points.toLocaleString()}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>

                    <div className="flex flex-col gap-6">
                        <section className="rounded-2xl border border-[rgba(116,119,117,0.22)] p-5">
                            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#1F1F1F]"><Award size={16} className="text-[#0B57D0]" /> Achievements</h2>
                            {data.achievements.length === 0 ? (
                                <p className="text-sm text-[#80868B]">Earn points to unlock tiers and milestones.</p>
                            ) : (
                                <ul className="flex flex-col gap-3">
                                    {data.achievements.map((a) => (
                                        <li key={a.id} className="text-sm">
                                            <p className="font-semibold text-[#1F1F1F]">{a.title}</p>
                                            <p className="text-xs text-[#5F6368]">{a.description}</p>
                                            {a.code && a.status === 'ISSUED' && (
                                                <button type="button" onClick={() => copy(a.code!, a.id)} className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#D3E3FD] px-3 py-1 text-xs font-bold tracking-widest text-[#041E49]">
                                                    {copied === a.id ? <><Check size={12} /> Copied</> : <><Ticket size={12} /> {a.code}</>}
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                </div>
            )}

            <Dialog open={!!redeeming} title="Redeem this reward?" onClose={() => setRedeeming(null)}>
                <ErrorNote text={error} />
                <p className="mb-1 text-base font-bold text-[#1F1F1F]">{redeeming?.title}</p>
                <p className="mb-5 text-sm text-[#5F6368]">This uses {redeeming?.points.toLocaleString()} points and gives you a voucher code to show the business.</p>
                <div className="flex gap-3">
                    <TonalButton onClick={() => setRedeeming(null)} className="h-12 flex-1">Cancel</TonalButton>
                    <PrimaryButton busy={busy} onClick={() => redeeming && redeem(redeeming)} className="flex-1">Redeem</PrimaryButton>
                </div>
            </Dialog>

            <Dialog open={!!issued} title="Voucher ready" onClose={() => setIssued(null)}>
                <div className="flex flex-col items-center text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[#34A853] text-[#34A853]"><Check size={28} strokeWidth={3} /></span>
                    <p className="mt-3 text-base font-bold text-[#1F1F1F]">{issued?.title}</p>
                    <p className="text-sm text-[#5F6368]">Show this code at {issued?.business}</p>
                    <button type="button" onClick={() => issued && copy(issued.code, 'issued')} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#D3E3FD] px-6 py-3 text-xl font-bold tracking-[0.25em] text-[#041E49]">
                        {copied === 'issued' ? <Check size={18} /> : <Copy size={16} />} {issued?.code}
                    </button>
                    <PrimaryButton onClick={() => setIssued(null)} className="mt-6 w-full">Done</PrimaryButton>
                </div>
            </Dialog>
        </PagePanel>
    );
};

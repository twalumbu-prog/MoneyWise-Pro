import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Gift, Percent, Tag, Loader2, ChevronRight, Check } from 'lucide-react';
import { rewardsService, type PurchaseClaim, type PurchasePreview, type RewardCard, type RewardOption } from 'core';
import { useAuth } from '../../context/AuthContext';
import { signUpForRewards } from '../../lib/rewardClaims';
import { RewardsProgress, fmtPoints } from './RewardsUI';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export const GoogleMark: React.FC<{ size?: number }> = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
        <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
);

const rewardIcon = (type: RewardOption['type']) => (type === 'PERCENT_OFF' ? Percent : type === 'FREE_ITEM' ? Gift : Tag);

/** One reward the business offers, with how many points it takes. */
export const RewardOptionRow: React.FC<{ reward: RewardOption; action?: React.ReactNode }> = ({ reward, action }) => {
    const Icon = rewardIcon(reward.type);
    return (
        <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${reward.affordable ? 'bg-[#006AFF] text-white' : 'bg-[#EEF4FF] text-[#006AFF]'}`}>
                <Icon size={17} strokeWidth={2.2} />
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-slate-900 leading-snug line-clamp-2">{reward.title}</p>
                <p className="text-[11px] text-zinc-500 truncate">
                    {reward.affordable ? 'You have enough points' : `${fmtPoints(reward.pointsToGo)} more points`}
                    {reward.appliesTo !== 'Anything' ? ` · ${reward.appliesTo}` : ''}
                </p>
            </div>
            {action ?? (
                <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${reward.affordable ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-zinc-600'}`}>
                    {fmtPoints(reward.points)} pts
                </span>
            )}
        </li>
    );
};

type View = { card: RewardCard; rewards: RewardOption[]; points: number; first: boolean };

/**
 * Shown on the store's success screen when the business runs a rewards programme: the points this purchase earned, progress to
 * the next reward, the rewards on offer, and a way to keep them — "Sign up with Google", or (already signed in on this browser)
 * the points are added to the person's rewards automatically.
 */
export const StoreRewardsSection: React.FC<{ reference: string; organizationId: string; businessName: string }> = ({ reference, organizationId, businessName }) => {
    const { session } = useAuth();
    const [preview, setPreview] = useState<Extract<PurchasePreview, { enabled: true }> | null>(null);
    const [claim, setClaim] = useState<PurchaseClaim | null>(null);
    const [claimNote, setClaimNote] = useState<string | null>(null);
    const [claiming, setClaiming] = useState(false);
    const [signingUp, setSigningUp] = useState(false);
    const [signUpError, setSignUpError] = useState<string | null>(null);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    // What the purchase earns (works for anyone; the intent was logged before the payment started).
    useEffect(() => {
        if (!reference || !organizationId) return;
        let tries = 0;
        let timer: ReturnType<typeof setTimeout>;
        const load = async () => {
            try {
                const { data } = await axios.get<PurchasePreview>(`${API_URL}/rewards/public/purchase`, { params: { reference, organizationId }, timeout: 15000 });
                if (!alive.current) return;
                if (data.enabled) setPreview(data);
            } catch {
                if (alive.current && ++tries < 3) timer = setTimeout(load, 2500);
            }
        };
        load();
        return () => clearTimeout(timer);
    }, [reference, organizationId]);

    // Signed in on this browser: add the points to their account straight away. The ledger write can lag the success
    // screen by a few seconds, so "still being confirmed" is retried.
    useEffect(() => {
        if (!session || !preview || claim) return;
        let tries = 0;
        let timer: ReturnType<typeof setTimeout>;
        setClaiming(true);
        const attempt = async () => {
            try {
                const result = await rewardsService.claimPurchase(reference, organizationId);
                if (!alive.current) return;
                setClaim(result);
                setClaiming(false);
            } catch (e: any) {
                if (!alive.current) return;
                if (e?.status === 409 && /being confirmed/i.test(String(e?.message)) && ++tries < 12) { timer = setTimeout(attempt, 3000); return; }
                setClaimNote(e?.message || 'We couldn’t add these points right now.');
                setClaiming(false);
            }
        };
        attempt();
        return () => clearTimeout(timer);
    }, [session, preview, claim, reference, organizationId]);

    if (!preview) return null;

    const view: View = claim
        ? { card: claim.card, rewards: claim.rewards, points: claim.pointsEarned, first: claim.firstPoints }
        : { card: preview.card, rewards: preview.rewards, points: preview.pointsEarned, first: true };
    const { card } = view;

    const handleSignUp = async () => {
        setSigningUp(true);
        setSignUpError(null);
        try { await signUpForRewards(reference, organizationId); } catch (e: any) {
            setSignUpError(e?.message || 'Couldn’t open Google sign-in. Please try again.');
            setSigningUp(false);
        }
    };

    const headline = view.points <= 0
        ? `You’re now earning with ${businessName}`
        : (() => {
            const pts = `${fmtPoints(view.points)} point${Math.round(view.points) === 1 ? '' : 's'}`;
            return view.first ? `You’ve earned your first ${pts}!` : `You’ve earned ${pts}!`;
        })();

    return (
        <section className="mt-7 animate-in fade-in slide-in-from-bottom-3 duration-500" aria-label="Rewards">
            {/* Points earned + progress to the next reward */}
            <div className="relative overflow-hidden rounded-2xl border border-[#DCE7FF] bg-gradient-to-br from-[#EEF4FF] via-white to-white px-5 pt-5 pb-4">
                <div className="relative">
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#006AFF] truncate">Rewards · {businessName.replace(/[.\s]+$/, '')}</p>
                        <h3 className="text-[15px] font-black text-slate-900 leading-snug mt-0.5">{headline}</h3>
                    </div>
                </div>

                <div className="relative mt-4 flex items-end justify-between">
                    <div>
                        <p className="text-[28px] leading-none font-black text-slate-900 tabular-nums">{fmtPoints(card.balance)}</p>
                        <p className="text-[11px] text-zinc-500 mt-1">{claim ? `${card.status} · points balance` : 'points with this purchase'}</p>
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-500">{preview.pointsPerKwacha === 1 ? '1 point' : `${preview.pointsPerKwacha} points`} per K1</span>
                </div>

                {card.threshold ? (
                    <div className="relative mt-3">
                        <RewardsProgress progress={card.progress} />
                        <div className="mt-2 flex justify-between gap-3 text-[11px] font-bold text-[#737373]">
                            <span className="truncate">{card.rewardReady ? `${card.rewardTitle} is ready to redeem` : `${fmtPoints(card.pointsToNext ?? 0)} points to ${card.rewardTitle}`}</span>
                            <span>{Math.round(card.progress * 100)}%</span>
                        </div>
                    </div>
                ) : null}
            </div>

            {/* What the points unlock */}
            {view.rewards.length > 0 && (
                <div className="mt-4 bg-gray-50 border border-neutral-200 rounded-2xl px-5 pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Gift size={15} className="text-slate-900" />
                        <span className="text-xs font-bold text-zinc-600">Rewards you can unlock</span>
                    </div>
                    <ul className="divide-y divide-neutral-200">
                        {view.rewards.map((r) => <RewardOptionRow key={r.id} reward={r} />)}
                    </ul>
                </div>
            )}

            {/* Keep the points */}
            <div className="mt-4">
                {session ? (
                    claim ? (
                        <>
                            <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-emerald-700 mb-2.5">
                                <Check size={13} strokeWidth={3} /> {claim.alreadyClaimed ? 'Already in your rewards' : 'Added to your rewards'}
                            </p>
                            <Link to="/rewards" className="w-full flex items-center justify-center gap-1.5 py-3.5 rounded-2xl bg-[#006AFF] hover:bg-[#0052CC] text-white text-xs font-bold transition-all">
                                View my rewards <ChevronRight size={14} />
                            </Link>
                        </>
                    ) : claiming ? (
                        <p className="flex items-center justify-center gap-2 text-[11px] font-semibold text-zinc-500 py-3"><Loader2 size={13} className="animate-spin" /> Adding points to your rewards…</p>
                    ) : claimNote ? (
                        <p className="text-center text-[11px] text-zinc-500 py-2">{claimNote}</p>
                    ) : null
                ) : preview.claimed ? (
                    <p className="text-center text-[11px] text-zinc-500 py-2">These points have already been added to a MoneyWise account.</p>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={handleSignUp}
                            disabled={signingUp}
                            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-white border border-neutral-300 hover:bg-gray-50 text-slate-900 text-[13px] font-bold shadow-sm transition-all disabled:opacity-60"
                        >
                            {signingUp ? <Loader2 size={16} className="animate-spin" /> : <GoogleMark />}
                            Sign up with Google to redeem your rewards
                        </button>
                        <p className="text-center text-[10px] text-zinc-400 mt-2">Free MoneyWise account. Every purchase on this browser keeps adding points.</p>
                        {signUpError && <p className="text-center text-[11px] text-rose-600 mt-2">{signUpError}</p>}
                    </>
                )}
            </div>
        </section>
    );
};

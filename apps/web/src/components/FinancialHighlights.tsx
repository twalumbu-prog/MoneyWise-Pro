import React, { useEffect, useRef, useState } from 'react';
import { Megaphone, ArrowRight, Trophy } from 'lucide-react';
import {
    highlightsService,
    HighlightCard,
    Achievement,
} from '../services/highlights.service';
import Confetti from './Confetti';

/**
 * Financial Highlights — a swipeable stack of AI-written "here's what changed
 * since you were last here" cards. When the business has just broken one of
 * its own records, an achievement card (trophy badge styling) is woven into
 * that same stack — the server only ever sends one when a real, freshly-
 * detected record exists, so it never appears on an ordinary week.
 *
 * The card stack auto-advances every few seconds so the owner can glance and
 * feel caught up without tapping; manual swipes pause the rotation. The unread
 * badge counts cards they haven't landed on yet this session.
 */

const money = (n: number) =>
    `K${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

const isAchievementCard = (card: HighlightCard) => card.id.startsWith('achievement-');

export const FinancialHighlights: React.FC = () => {
    const [cards, setCards] = useState<HighlightCard[]>([]);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [showConfetti, setShowConfetti] = useState(false);
    const [loading, setLoading] = useState(true);
    const [active, setActive] = useState(0);
    const [seen, setSeen] = useState<Set<number>>(new Set([0]));
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const pausedUntil = useRef<number>(0);

    useEffect(() => {
        let cancelled = false;
        highlightsService.getHighlights()
            .then(payload => {
                if (cancelled) return;
                setCards(payload.cards);
                setAchievements(payload.achievements);

                // A record was broken — celebrate, then tell the server we've
                // shown it so it never fires twice for the same achievement.
                if (payload.achievements.length > 0) {
                    setShowConfetti(true);
                    highlightsService
                        .acknowledgeAchievements(payload.achievements.map(a => a.id))
                        .catch(err => console.error('Failed to acknowledge achievements:', err));
                }
            })
            .catch(err => console.error('Failed to load highlights:', err))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const goTo = (idx: number, smooth = true) => {
        const el = scrollRef.current;
        if (!el || cards.length === 0) return;
        const clamped = ((idx % cards.length) + cards.length) % cards.length;
        el.scrollTo({ left: clamped * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    };

    // Auto-advance loop — skips a tick if the user recently interacted.
    useEffect(() => {
        if (cards.length <= 1) return;
        autoTimer.current = setInterval(() => {
            if (Date.now() < pausedUntil.current) return;
            setActive(prev => {
                const next = (prev + 1) % cards.length;
                goTo(next);
                return next;
            });
        }, 9000);
        return () => { if (autoTimer.current) clearInterval(autoTimer.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cards.length]);

    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const idx = Math.round(el.scrollLeft / el.clientWidth);
        if (idx !== active) {
            setActive(idx);
            setSeen(prev => new Set(prev).add(idx));
        }
    };

    const pauseAuto = () => { pausedUntil.current = Date.now() + 9000; };

    if (loading) {
        return (
            <div className="mx-5 mb-5 rounded-2xl bg-white shadow-[0px_4px_4px_0px_rgba(0,0,0,0.05)] outline outline-1 outline-offset-[-1px] outline-gray-200 px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                    <Megaphone size={18} className="text-gray-300" />
                    <div className="h-3.5 w-36 rounded bg-gray-100 animate-pulse" />
                </div>
                <div className="h-3 w-full rounded bg-gray-100 animate-pulse mb-2" />
                <div className="h-3 w-2/3 rounded bg-gray-100 animate-pulse" />
            </div>
        );
    }

    if (cards.length === 0) return null;

    const unread = Math.max(0, cards.length - seen.size);

    return (
        <>
            {showConfetti && (
                <Confetti
                    origin={(() => {
                        const rect = containerRef.current?.getBoundingClientRect();
                        return rect
                            ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
                            : undefined;
                    })()}
                    onComplete={() => setShowConfetti(false)}
                />
            )}

            <div ref={containerRef} className="mx-5 mb-5 rounded-2xl bg-white shadow-[0px_4px_4px_0px_rgba(0,0,0,0.05)] outline outline-1 outline-offset-[-1px] outline-gray-200 px-5 py-4">
                {/* Header */}
                <div className="flex items-center gap-2 mb-3">
                    <Megaphone size={18} className="text-black" strokeWidth={1.75} />
                    <span className="flex-1 text-base font-bold text-black">Financial Highlights</span>
                    {unread > 0 && (
                        <span className="min-w-5 h-5 px-2 bg-red-600 rounded-full flex items-center justify-center">
                            <span className="text-white text-[10px] font-bold font-figtree leading-3">{unread}</span>
                        </span>
                    )}
                </div>

                {/* Swipeable card track — a real, freshly-detected achievement is woven
                    in as one of the slides (trophy styling); every other slide is the
                    plain AI-written body text. */}
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    onPointerDown={pauseAuto}
                    onTouchStart={pauseAuto}
                    className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-1"
                >
                    {cards.map((card) => {
                        const achievement = isAchievementCard(card)
                            ? achievements.find(a => card.id === `achievement-${a.id}`)
                            : undefined;

                        if (achievement) {
                            return (
                                <div key={card.id} className="snap-center shrink-0 w-full px-1">
                                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-[#006AFF] to-[#0A4FBF] shadow-[0_10px_24px_-12px_rgba(0,106,255,0.9)]">
                                        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                                            <Trophy size={18} className="text-white" strokeWidth={2} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-white/70">New record</div>
                                            <div className="text-sm font-black text-white truncate">
                                                {achievement.title} · {money(achievement.value)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={card.id} className="snap-center shrink-0 w-full px-1">
                                <p className="text-sm font-normal text-black leading-5">
                                    {card.body}
                                </p>
                            </div>
                        );
                    })}
                </div>

                {/* See more + dots */}
                <div className="flex items-center gap-1 mt-3">
                    <button
                        onClick={() => sendPromptSafe(cards[active])}
                        className="flex items-center gap-1 text-sm font-normal text-blue-600 active:opacity-70 transition-opacity"
                    >
                        See more
                        <ArrowRight size={16} className="text-blue-600" />
                    </button>
                </div>

                {cards.length > 1 && (
                    <div className="flex justify-center items-center gap-2.5 mt-2">
                        {cards.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => { pauseAuto(); goTo(i); }}
                                aria-label={`Highlight card ${i + 1}`}
                                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                    i === active ? 'bg-blue-700 scale-110' : 'bg-zinc-300'
                                }`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
};

// Highlights live inside the Reports screen; "See more" just scrolls the user
// down to the detailed breakdown by dispatching a lightweight custom event the
// page listens for. Kept defensive so it never throws if nothing's listening.
function sendPromptSafe(card?: HighlightCard) {
    if (!card) return;
    try {
        window.dispatchEvent(new CustomEvent('highlights:seeMore', { detail: card }));
    } catch {
        /* no-op */
    }
}

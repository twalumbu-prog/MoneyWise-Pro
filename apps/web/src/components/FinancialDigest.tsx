import React, { useEffect, useRef, useState } from 'react';
import { Megaphone, ArrowRight } from 'lucide-react';
import { digestService, DigestCard } from '../services/digest.service';

/**
 * Financial Digest — a swipeable stack of AI-written "here's what changed since
 * you were last here" cards. It auto-advances every few seconds so the owner can
 * glance and feel caught up without tapping, but manual swipes pause the auto
 * rotation. The unread badge counts cards the user hasn't landed on yet this
 * session.
 */
export const FinancialDigest: React.FC = () => {
    const [cards, setCards] = useState<DigestCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [active, setActive] = useState(0);
    const [seen, setSeen] = useState<Set<number>>(new Set([0]));
    const scrollRef = useRef<HTMLDivElement>(null);
    const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const pausedUntil = useRef<number>(0);

    useEffect(() => {
        let cancelled = false;
        digestService.getDigest()
            .then(c => { if (!cancelled) setCards(c); })
            .catch(err => console.error('Failed to load digest:', err))
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
                    <div className="h-3.5 w-32 rounded bg-gray-100 animate-pulse" />
                </div>
                <div className="h-3 w-full rounded bg-gray-100 animate-pulse mb-2" />
                <div className="h-3 w-2/3 rounded bg-gray-100 animate-pulse" />
            </div>
        );
    }

    if (cards.length === 0) return null;

    const unread = Math.max(0, cards.length - seen.size);

    return (
        <div className="mx-5 mb-5 rounded-2xl bg-white shadow-[0px_4px_4px_0px_rgba(0,0,0,0.05)] outline outline-1 outline-offset-[-1px] outline-gray-200 px-5 py-4">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                <Megaphone size={18} className="text-black" strokeWidth={1.75} />
                <span className="flex-1 text-base font-bold text-black">Financial Digest</span>
                {unread > 0 && (
                    <span className="min-w-5 h-5 px-2 bg-red-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold font-figtree leading-3">{unread}</span>
                    </span>
                )}
            </div>

            {/* Swipeable card track */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                onPointerDown={pauseAuto}
                onTouchStart={pauseAuto}
                className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-1"
            >
                {cards.map((card) => (
                    <div key={card.id} className="snap-center shrink-0 w-full px-1">
                        <p className="text-sm font-normal text-black leading-5">
                            {card.body}
                        </p>
                    </div>
                ))}
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
                            aria-label={`Digest card ${i + 1}`}
                            className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                i === active ? 'bg-blue-700 scale-110' : 'bg-zinc-300'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// The digest lives inside the Reports screen; "See more" just scrolls the user
// down to the detailed breakdown by dispatching a lightweight custom event the
// page listens for. Kept defensive so it never throws if nothing's listening.
function sendPromptSafe(card: DigestCard) {
    try {
        window.dispatchEvent(new CustomEvent('digest:seeMore', { detail: card }));
    } catch {
        /* no-op */
    }
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { PriceText, Thumb } from './parts';
import { actionOf } from './kinds';
import type { Listing } from './parts';

/**
 * The store's "Showcase" layout: an immersive hero for the seller's best items, like a product landing page. One item at a time fills the
 * stage (a big headline, a few words about it, the price, a clear way to order, and the picture large with a soft glow behind it), with the
 * other items as small tiles underneath to switch between. It reads the store's own colours, so every store's showcase looks like theirs.
 * It changes by itself every few seconds (not for people who ask their device for less motion, and never while someone is hovering over it).
 */
const MAX = 6;

export const StoreShowcase: React.FC<{
    items: Listing[];
    dark: boolean;
    headingClass: string;
    onOpen: (l: Listing) => void;
    onOrder: (l: Listing) => void;
}> = ({ items, dark, headingClass, onOpen, onOrder }) => {
    // Items with a picture lead; the rest follow. Only a handful so the stage stays focused.
    const stage = useMemo(() => [...items].sort((a, b) => Number(!!b.imageUrl) - Number(!!a.imageUrl)).slice(0, MAX), [items]);
    const [i, setI] = useState(0);
    const hover = useRef(false);
    const n = stage.length;
    const cur = stage[Math.min(i, n - 1)];

    useEffect(() => { if (i >= n) setI(0); }, [n, i]);
    useEffect(() => {
        if (n < 2) return;
        if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const t = setInterval(() => { if (!hover.current) setI((x) => (x + 1) % n); }, 6500);
        return () => clearInterval(t);
    }, [n]);

    if (!cur) return null;
    const go = (d: number) => setI((x) => (x + d + n) % n);
    const action = actionOf(cur);
    const ink = dark ? '#FFFFFF' : '#111111';
    const soft = dark ? 'rgba(255,255,255,0.68)' : 'rgba(17,17,17,0.62)';

    return (
        <section
            aria-label="Featured items"
            className="relative mb-8 overflow-hidden rounded-[var(--s-card)]"
            style={{ background: dark
                ? 'radial-gradient(120% 90% at 78% 30%, color-mix(in srgb, var(--s-accent) 38%, #0e0e0e) 0%, #0e0e0e 62%)'
                : 'radial-gradient(120% 90% at 78% 30%, color-mix(in srgb, var(--s-accent) 22%, #ffffff) 0%, #ffffff 65%)', color: ink }}
            onMouseEnter={() => { hover.current = true; }} onMouseLeave={() => { hover.current = false; }}
        >
            {/* a soft ring of the store's colour behind the picture */}
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-1/2 hidden h-[520px] w-[520px] -translate-y-1/2 rounded-full opacity-60 blur-3xl md:block" style={{ background: 'var(--s-accent)' }} />

            <div className="relative grid items-center gap-6 p-6 md:min-h-[460px] md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-10 md:p-12">
                <div key={cur.id} className="order-2 flex flex-col md:order-1" style={{ animation: 'bo-fade-up .5s ease both' }}>
                    <span className="mb-3 inline-flex w-fit items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ background: 'var(--s-accent)', color: 'var(--s-accent-ink)' }}>
                        {cur.category || 'Featured'}
                    </span>
                    <h3 className={`text-4xl leading-[1.05] md:text-6xl ${headingClass}`}>{cur.name}</h3>
                    {cur.description && <p className="mt-4 line-clamp-3 max-w-md text-sm leading-relaxed md:text-base" style={{ color: soft }}>{cur.description}</p>}
                    <p className="mt-5 text-3xl font-bold tabular-nums md:text-4xl"><PriceText l={cur} /></p>
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <button type="button" onClick={() => onOrder(cur)} className="inline-flex h-12 items-center gap-2 px-7 text-base font-bold shadow-lg transition hover:scale-[1.02] rounded-[var(--s-control)]" style={{ background: 'var(--s-accent)', color: 'var(--s-accent-ink)' }}>
                            {action.label} <ArrowRight size={16} />
                        </button>
                        <button type="button" onClick={() => onOpen(cur)} className="inline-flex h-12 items-center px-6 text-sm font-semibold transition hover:opacity-80 rounded-[var(--s-control)]" style={{ boxShadow: `inset 0 0 0 1.5px ${dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'}`, color: ink }}>
                            See details
                        </button>
                    </div>
                    {n > 1 && (
                        <div className="mt-8 flex items-center gap-3">
                            <button type="button" onClick={() => go(-1)} aria-label="Previous item" className="flex h-10 w-10 items-center justify-center rounded-full transition hover:scale-105" style={{ background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }}><ChevronLeft size={18} /></button>
                            <button type="button" onClick={() => go(1)} aria-label="Next item" className="flex h-10 w-10 items-center justify-center rounded-full transition hover:scale-105" style={{ background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }}><ChevronRight size={18} /></button>
                            <span className="text-xs font-semibold tabular-nums" style={{ color: soft }}>{Math.min(i, n - 1) + 1} / {n}</span>
                        </div>
                    )}
                </div>

                <div className="order-1 md:order-2">
                    <button type="button" onClick={() => onOpen(cur)} aria-label={`Open ${cur.name}`} className="relative mx-auto block aspect-square w-full max-w-[520px]">
                        <div key={cur.id} className="h-full w-full" style={{ animation: 'bo-pop .6s ease both' }}>
                            {cur.imageUrl
                                ? <Thumb listing={cur} contain eager width={900} sizes="(min-width: 768px) 46vw, 90vw" className="drop-shadow-[0_30px_40px_rgba(0,0,0,0.35)]" />
                                : <div className="flex h-full w-full items-center justify-center rounded-full text-7xl font-bold opacity-80" style={{ background: 'var(--s-accent)', color: 'var(--s-accent-ink)' }}>{cur.name.slice(0, 1).toUpperCase()}</div>}
                        </div>
                    </button>
                </div>
            </div>

            {n > 1 && (
                <div className="relative flex gap-3 overflow-x-auto px-6 pb-6 md:px-12 md:pb-8" role="tablist" aria-label="Choose a featured item">
                    {stage.map((l, k) => (
                        <button key={l.id} type="button" role="tab" aria-selected={k === i} onClick={() => setI(k)}
                            className="flex w-[148px] flex-shrink-0 items-center gap-2.5 p-2 text-left transition rounded-[var(--s-control)]"
                            style={{ background: k === i ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.07)') : 'transparent', boxShadow: k === i ? 'inset 0 0 0 2px var(--s-accent)' : `inset 0 0 0 1px ${dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)'}` }}>
                            <span className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-white/10"><Thumb listing={l} width={120} sizes="44px" /></span>
                            <span className="min-w-0"><span className="block truncate text-xs font-semibold">{l.name}</span><span className="block truncate text-[11px] font-bold tabular-nums" style={{ color: 'var(--s-accent-text)' }}><PriceText l={l} /></span></span>
                        </button>
                    ))}
                </div>
            )}

            <style>{`
                @keyframes bo-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
                @keyframes bo-pop { from { opacity: 0; transform: scale(.94) translateY(10px); } to { opacity: 1; transform: none; } }
                @media (prefers-reduced-motion: reduce) { [style*="bo-fade-up"], [style*="bo-pop"] { animation: none !important; } }
            `}</style>
        </section>
    );
};

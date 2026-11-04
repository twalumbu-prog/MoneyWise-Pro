import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { resized } from '../../lib/images';

/**
 * The big rotating banner at the top of the Marketplace: what is being pushed (paid placements, then MoneyWise's own features).
 * Each slide has a headline, a line, a button and up to three pictures; it moves every few seconds and can be paused.
 */
export interface Slide {
    id: string;
    /** Background and text colours. */
    bg: string; ink: string; button: { bg: string; ink: string };
    title: string; text: string; cta: string; onCta: () => void;
    /** Small label like "Sponsored". */
    tag?: string;
    items: { id: string; image: string | null; label: string; /** A small line under the name, like the price. */ sub?: string; onOpen: () => void }[];
    onShow?: () => void;
}

export const HeroCarousel: React.FC<{ slides: Slide[] }> = ({ slides }) => {
    const [i, setI] = useState(0);
    const [paused, setPaused] = useState(false);
    const n = slides.length;
    useEffect(() => { if (i >= n) setI(0); }, [n, i]);
    useEffect(() => {
        if (paused || n < 2) return;
        const t = setInterval(() => setI((x) => (x + 1) % n), 6000);
        return () => clearInterval(t);
    }, [paused, n]);
    const s = slides[Math.min(i, n - 1)];
    useEffect(() => { s?.onShow?.(); }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!s) return null;

    return (
        <section className="relative mb-7 overflow-hidden rounded-[28px]" style={{ background: s.bg, color: s.ink }} aria-roledescription="carousel" aria-label="Featured">
            <div key={s.id} className="grid grid-cols-1 items-center gap-4 p-5 pb-14 md:min-h-[340px] md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] md:gap-6 md:p-10 animate-in fade-in duration-500">
                <div className="max-w-md">
                    {s.tag && <span className="mb-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: s.ink, color: s.bg }}>{s.tag}</span>}
                    <h2 className="text-2xl font-bold leading-tight md:text-[40px]">{s.title}</h2>
                    <p className="mt-1.5 line-clamp-2 text-sm opacity-85 md:line-clamp-none md:text-base">{s.text}</p>
                    <button type="button" onClick={s.onCta} className="mt-4 h-11 rounded-full px-6 text-base md:mt-6 md:h-12 md:px-7 font-bold transition hover:opacity-90" style={{ background: s.button.bg, color: s.button.ink }}>{s.cta}</button>
                </div>
                {s.items.length > 0 && (
                    <ul className="mx-auto grid w-full gap-3 md:gap-5" style={{ gridTemplateColumns: `repeat(${Math.min(3, s.items.length)}, minmax(0, 1fr))`, maxWidth: Math.min(3, s.items.length) * 230 }}>
                        {s.items.slice(0, 3).map((it) => (
                            <li key={it.id}>
                                <button type="button" onClick={it.onOpen} className="group block w-full text-center">
                                    <span className="mx-auto block aspect-square w-full overflow-hidden rounded-[20px] bg-white/25">
                                        {it.image ? <img src={resized(it.image, 360, { square: true })} alt="" className="h-full w-full object-cover transition group-hover:scale-105" loading="eager" /> : null}
                                    </span>
                                    <span className="mt-2 block truncate text-sm font-bold">{it.label}</span>
                                    {it.sub && <span className="block truncate text-xs opacity-80">{it.sub}</span>}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {n > 1 && (
                <>
                    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2" role="tablist" aria-label="Slides">
                        {slides.map((x, k) => <button key={x.id} type="button" role="tab" aria-selected={k === i} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} className="h-2 rounded-full transition-all" style={{ width: k === i ? 22 : 8, background: s.ink, opacity: k === i ? 0.9 : 0.35 }} />)}
                    </div>
                    <div className="absolute bottom-3 right-4 flex gap-2">
                        <button type="button" aria-label="Previous slide" onClick={() => setI((x) => (x - 1 + n) % n)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#1F1F1F] shadow"><ChevronLeft size={18} /></button>
                        <button type="button" aria-label="Next slide" onClick={() => setI((x) => (x + 1) % n)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#1F1F1F] shadow"><ChevronRight size={18} /></button>
                        <button type="button" aria-label={paused ? 'Play slides' : 'Pause slides'} onClick={() => setPaused((p) => !p)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#1F1F1F] shadow">{paused ? <Play size={16} /> : <Pause size={16} />}</button>
                    </div>
                </>
            )}
        </section>
    );
};

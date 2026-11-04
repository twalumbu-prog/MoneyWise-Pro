import React from 'react';
import { Link } from 'react-router-dom';
import { resized } from '../../lib/images';
import { categorize, categoryPath } from './taxonomy';
import type { CategoryCounts, MainCategory } from './taxonomy';
import type { Listing } from './parts';

/** A square category tile like eBay's: a picture of something in it, the name under it, and how many there are. */
export const CategoryTile: React.FC<{ to: string; name: string; count?: number; image?: string | null; icon?: React.ComponentType<any>; tone?: string }> = ({ to, name, count, image, icon: Icon, tone = '#0B57D0' }) => (
    <Link to={to} className="group block w-full text-left">
        <span className="relative block aspect-square overflow-hidden rounded-[22px] bg-[#F1F3F4]">
            {image ? (
                <img src={resized(image, 360, { square: true })} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition group-hover:scale-105" />
            ) : (
                <span className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${tone}22, ${tone}44)`, color: tone }}>{Icon ? <Icon size={44} strokeWidth={1.4} /> : null}</span>
            )}
        </span>
        <span className="mt-2 block text-sm font-medium text-[#1F1F1F] group-hover:underline">{name}</span>
        {count !== undefined && <span className="block text-xs text-[#80868B]">{count} {count === 1 ? 'item' : 'items'}</span>}
    </Link>
);

/** A listing in this set that has a real picture, to stand for the set. */
export const pictureFor = (listings: Listing[], pick: (l: Listing) => boolean): string | null => listings.find((l) => pick(l) && l.imageUrl)?.imageUrl ?? null;

/** All the main categories as tiles ("Shop by category"). */
export const MainCategoryTiles: React.FC<{ listings: Listing[]; counts: CategoryCounts; mains: MainCategory[] }> = ({ listings, counts, mains }) => (
    <ul className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-6 xl:grid-cols-8">
        {mains.map((m) => (
            <li key={m.id} className="w-[34vw] max-w-[160px] flex-shrink-0 snap-start md:w-auto md:max-w-none"><CategoryTile to={categoryPath(m.id)} name={m.name} count={counts.main.get(m.id) ?? 0} image={pictureFor(listings, (l) => categorize(l).main === m.id)} icon={m.icon} tone={m.tone} /></li>
        ))}
    </ul>
);

/** A dark promotional band with a headline, a button and a few pictures, for what is being pushed between sections. */
export const PromoBand: React.FC<{ bg: string; ink: string; title: string; text: string; cta: string; onCta: () => void; images: (string | null)[]; ctaBg?: string; ctaInk?: string }> = ({ bg, ink, title, text, cta, onCta, images, ctaBg = '#FFFFFF', ctaInk = '#111111' }) => (
    <section className="my-8 grid grid-cols-1 items-center gap-4 overflow-hidden rounded-[28px] p-5 md:my-10 md:grid-cols-[1fr_1.1fr] md:gap-6 md:p-10" style={{ background: bg, color: ink }}>
        <div className="max-w-md">
            <h2 className="text-2xl font-bold leading-tight md:text-[38px]">{title}</h2>
            <p className="mt-2 text-base opacity-85">{text}</p>
            <button type="button" onClick={onCta} className="mt-6 h-12 rounded-full px-7 text-base font-bold transition hover:opacity-90" style={{ background: ctaBg, color: ctaInk }}>{cta}</button>
        </div>
        <div className="flex items-center justify-center gap-0 md:justify-end">
            {images.slice(0, 3).map((src, i) => (
                <span key={i} className="-ml-5 block h-32 w-28 overflow-hidden rounded-2xl bg-white shadow-xl first:ml-0 md:h-44 md:w-36" style={{ transform: `rotate(${[-7, 2, 8][i % 3]}deg)`, marginTop: i === 1 ? 14 : 0 }}>
                    {src ? <img src={resized(src, 320, { square: true })} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="block h-full w-full bg-white/80" />}
                </span>
            ))}
        </div>
    </section>
);

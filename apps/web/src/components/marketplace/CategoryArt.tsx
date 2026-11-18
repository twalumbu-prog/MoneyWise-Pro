import React from 'react';
import { cachedLogoColour, logoColour, paletteFrom } from './logoPalette';
import type { LogoColour } from './logoPalette';
import {
    BedDouble, BookOpen, Briefcase, Car, CupSoda, FileDown, Flower2, Gift, GraduationCap, HeartPulse, Home, Laptop, Package, PartyPopper, Scissors, Shirt, Smartphone,
    Sparkles, Tent, Ticket, UtensilsCrossed, Wrench,
} from 'lucide-react';

interface Art { Icon: React.ComponentType<any>; from: string; to: string; ink: string; label: string }

const tone = {
    blue: { from: '#E8F0FE', to: '#C6DBFB', ink: '#1967D2' },
    green: { from: '#E6F4EA', to: '#C5E5CE', ink: '#137333' },
    amber: { from: '#FEF7E0', to: '#FCE9A8', ink: '#B06000' },
    rose: { from: '#FCE8E6', to: '#F8CFCB', ink: '#B31412' },
    violet: { from: '#F3E8FD', to: '#E2CCFA', ink: '#7627BB' },
    teal: { from: '#E4F7FB', to: '#BFEAF3', ink: '#0B8793' },
} as const;

const RULES: { test: RegExp; Icon: React.ComponentType<any>; tone: keyof typeof tone }[] = [
    { test: /ticket|\bvip\b|admission|\bpass\b|early bird|concert|festival|gig/i, Icon: Ticket, tone: 'violet' },
    { test: /accomm|hotel|lodge|apartment|bnb|guest|room|stay/i, Icon: BedDouble, tone: 'teal' },
    { test: /camp|tent|safari|tour|travel|trip/i, Icon: Tent, tone: 'green' },
    { test: /real estate|property|house|rent|land/i, Icon: Home, tone: 'blue' },
    { test: /food|meal|chicken|restaurant|kitchen|pizza|burger|catering|bake/i, Icon: UtensilsCrossed, tone: 'amber' },
    { test: /drink|juice|soda|beverage|coffee|tea|bar/i, Icon: CupSoda, tone: 'rose' },
    { test: /flower|rose|bouquet|plant/i, Icon: Flower2, tone: 'rose' },
    { test: /gift|perfume|fragrance|hamper|chocolate/i, Icon: Gift, tone: 'violet' },
    { test: /cloth|shirt|fashion|wear|dress|crocs|shoe|sneaker|footwear|t.?shirt/i, Icon: Shirt, tone: 'violet' },
    { test: /phone|mobile|electronic|gadget|tech/i, Icon: Smartphone, tone: 'blue' },
    { test: /computer|laptop|software|web|app|it /i, Icon: Laptop, tone: 'blue' },
    { test: /event|ticket|party|wedding|concert/i, Icon: PartyPopper, tone: 'amber' },
    { test: /transport|car|taxi|ride|vehicle|delivery|logistic|hire/i, Icon: Car, tone: 'teal' },
    { test: /beauty|salon|hair|barber|spa|makeup|nail/i, Icon: Scissors, tone: 'rose' },
    { test: /health|clinic|pharm|medical|fitness|gym/i, Icon: HeartPulse, tone: 'green' },
    { test: /educat|school|tutor|course|class|training|lesson/i, Icon: GraduationCap, tone: 'blue' },
    { test: /book|ebook|magazine|stationery/i, Icon: BookOpen, tone: 'amber' },
    { test: /clean|repair|plumb|electric|construct|build|maint|service|tailor/i, Icon: Wrench, tone: 'teal' },
    { test: /consult|business|account|legal|design|market/i, Icon: Briefcase, tone: 'blue' },
    { test: /beauty|style/i, Icon: Sparkles, tone: 'violet' },
];

const TONES = Object.keys(tone) as (keyof typeof tone)[];
/** A steady pick from the name, so unlabelled items don't all share one colour. */
const pickTone = (seed: string): keyof typeof tone => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TONES[h % TONES.length]; };

/** The default picture for an item that has none: an icon and colour that fit its category (or its kind: service, digital or product). */
export function categoryArt(category: string | null | undefined, productType: string, name?: string): Art {
    const text = String(category ?? '');
    // The item's own name counts too, so an uncategorised "VIP Ticket" still gets a ticket picture.
    const hit = RULES.find((r) => r.test.test(`${text} ${name ?? ''}`));
    if (hit) return { Icon: hit.Icon, ...tone[hit.tone], label: text || (hit.Icon === Ticket ? 'Ticket' : '') };
    const t = tone[pickTone(name || text || productType)];
    if (productType === 'DIGITAL') return { Icon: FileDown, ...t, label: text || 'Digital' };
    if (productType === 'PRODUCT') return { Icon: Package, ...t, label: text || 'Product' };
    return { Icon: Briefcase, ...t, label: text || 'Service' };
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

interface Palette { bg: string; fg: string; accent: string; soft: string }
/** Hand-picked colour sets (dark and light), so every cover looks designed and nothing is a stray bright default. */
const PALETTES: Palette[] = [
    { bg: '#10243E', fg: '#F7F3EA', accent: '#FFB703', soft: '#1D3B63' },
    { bg: '#0F3D2E', fg: '#F2F7EC', accent: '#C6F36B', soft: '#175A44' },
    { bg: '#3B1F4A', fg: '#FFF1F5', accent: '#FF8FB1', soft: '#5A2E70' },
    { bg: '#F4E9D8', fg: '#2B2118', accent: '#D1495B', soft: '#EAD7B8' },
    { bg: '#E8F1FF', fg: '#0B2A55', accent: '#0B57D0', soft: '#C9DDFB' },
    { bg: '#1E1E24', fg: '#F5F5F5', accent: '#FF6B4A', soft: '#32323C' },
    { bg: '#0D3B4C', fg: '#EAF8F7', accent: '#2EC4B6', soft: '#145770' },
    { bg: '#FFE8D6', fg: '#3A1F12', accent: '#E36414', soft: '#FFD3B0' },
    { bg: '#EDE7FF', fg: '#2D1B69', accent: '#7C4DFF', soft: '#D9CEFF' },
    { bg: '#F2F7E8', fg: '#1F3A12', accent: '#5FA83B', soft: '#DDECC4' },
    { bg: '#2B0F0F', fg: '#FFF0E6', accent: '#FF5A36', soft: '#4A1A1A' },
    { bg: '#FFF6D6', fg: '#2E2606', accent: '#F4B400', soft: '#FFE79A' },
];
/** Which colour sets suit which kind of thing (a menu leans warm, rooms calm, tickets rich), so the cover hints at what it is. */
const BIAS: { test: RegExp; picks: number[] }[] = [
    { test: /ticket|\bvip\b|\bpass\b|event|concert|party/i, picks: [2, 5, 8, 0] },
    { test: /accomm|room|apartment|lodge|hotel|stay|camp|tent/i, picks: [6, 3, 0, 9] },
    { test: /food|meal|chicken|drink|cake|bake|pizza|burger|coffee|tea|juice|restaurant/i, picks: [7, 11, 10, 5] },
    { test: /cloth|shirt|shoe|crocs|fashion|wear|perfume|beauty|hair|flower|gift/i, picks: [2, 8, 3, 4] },
    { test: /phone|tech|electronic|laptop|computer|software|web|app/i, picks: [0, 5, 6, 4] },
];

const FAMILY_SIZE = (n: number) => (n <= 10 ? 17 : n <= 18 ? 13 : n <= 30 ? 10 : 8);

/**
 * Fills its box with a designed cover when an item has no photo. Every item gets its own: the colours, the layout (poster, band,
 * dotted card or giant initial) and the type all come from its name, so no two look alike, and the same item always looks the same.
 * The company's logo sits in the corner. Sizes use the card's own width, so it looks right at any size.
 */
export const CategoryArt: React.FC<{ category: string | null | undefined; productType: string; name?: string; className?: string; compact?: boolean; logoUrl?: string | null }> = ({ category, productType, name, className = '', compact, logoUrl }) => {
    const { Icon, label } = categoryArt(category, productType, name);
    const [logoBroken, setLogoBroken] = React.useState(false);
    const title = (name || label || 'MoneyWise').trim();
    const seed = hash(`${title}|${category ?? ''}`);
    const bias = BIAS.find((b) => b.test.test(`${category ?? ''} ${title}`));
    // The company's own colours when its logo gives one (dark or pale by the item, so a company's items still differ); otherwise a set from the name.
    const [colour, setColour] = React.useState<LogoColour | null | undefined>(() => cachedLogoColour(logoUrl));
    React.useEffect(() => {
        if (!logoUrl) { setColour(null); return; }
        let live = true;
        logoColour(logoUrl).then((c) => { if (live) setColour(c); });
        return () => { live = false; };
    }, [logoUrl]);
    const p = colour ? paletteFrom(colour, (seed >>> 9) % 3 !== 0) : bias ? PALETTES[bias.picks[seed % bias.picks.length]] : PALETTES[seed % PALETTES.length];
    const layout = (seed >>> 5) % 4;
    const initial = (title.match(/[A-Za-z0-9]/)?.[0] ?? 'M').toUpperCase();
    const fit = FAMILY_SIZE(title.length);
    const cat = (label || '').toUpperCase();

    const shell = `relative h-full w-full overflow-hidden ${className}`;
    const base: React.CSSProperties = { background: p.bg, color: p.fg, containerType: 'inline-size' };
    const logo = logoUrl && !logoBroken ? (
        <span className="absolute left-3 top-3 z-10 flex items-center justify-center overflow-hidden rounded-full bg-white shadow-md" style={{ width: compact ? 26 : 42, height: compact ? 26 : 42 }}>
            <img src={logoUrl} alt="" loading="lazy" decoding="async" onError={() => setLogoBroken(true)} className="h-full w-full object-contain p-1" />
        </span>
    ) : null;

    // Small cards: just a clean monogram.
    if (compact) {
        return (
            <div className={shell} style={base} role="img" aria-label={`${title}${label ? ` (${label})` : ''}`}>
                <span aria-hidden className="absolute -right-6 -top-6 h-20 w-20 rounded-full" style={{ background: p.accent, opacity: 0.9 }} />
                <span className="absolute inset-0 flex items-center justify-center font-black" style={{ fontSize: '46cqw', color: p.accent === p.fg ? p.soft : p.fg, lineHeight: 1 }}>{initial}</span>
                {logo}
            </div>
        );
    }

    const kicker = cat ? <span className="block truncate font-bold tracking-[0.14em]" style={{ fontSize: '4.2cqw', color: p.accent }}>{cat}</span> : null;
    const heading = (extra = '', scale = 1): React.ReactNode => (
        <span className={`block font-extrabold leading-[1] tracking-tight ${extra}`} style={{ fontSize: `${fit * scale}cqw`, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'break-word' }}>{title}</span>
    );

    return (
        <div className={shell} style={base} role="img" aria-label={`${title}${label ? ` (${label})` : ''}`}>
            {layout === 0 && (
                <>
                    {/* Poster: a big accent disc, a ring, the category symbol as a watermark, the name set large */}
                    <span aria-hidden className="absolute rounded-full" style={{ right: '-20cqw', top: '-20cqw', width: '72cqw', height: '72cqw', background: p.accent }} />
                    <span aria-hidden className="absolute rounded-full" style={{ right: '8cqw', top: '30cqw', width: '28cqw', height: '28cqw', border: `1.2cqw solid ${p.accent}`, opacity: 0.5 }} />
                    <Icon aria-hidden strokeWidth={1.2} className="absolute" style={{ right: '7cqw', bottom: '8cqw', width: '30cqw', height: '30cqw', opacity: 0.1 }} />
                    <div className="absolute inset-x-0 bottom-0 p-[7cqw]">{kicker}{heading('uppercase mt-[1.5cqw]')}</div>
                </>
            )}
            {layout === 1 && (
                <>
                    {/* Band: a tilted accent stripe across the middle with the initial cut into it */}
                    <span aria-hidden className="absolute" style={{ left: '-10cqw', right: '-10cqw', top: '10cqw', height: '24cqw', background: p.accent, transform: 'rotate(-9deg)' }} />
                    <span aria-hidden className="absolute" style={{ left: '-10cqw', right: '-10cqw', top: '40cqw', height: '2.4cqw', background: p.soft, transform: 'rotate(-9deg)' }} />
                    <span aria-hidden className="absolute font-black" style={{ right: '8cqw', top: '6cqw', fontSize: '34cqw', lineHeight: 1, color: p.bg, opacity: 0.28 }}>{initial}</span>
                    <div className="absolute inset-x-0 bottom-0 p-[7cqw]">{kicker}{heading('mt-[1.5cqw]')}</div>
                </>
            )}
            {layout === 2 && (
                <>
                    {/* Dotted card: a patterned backdrop with the name on a raised card */}
                    <span aria-hidden className="absolute inset-0" style={{ backgroundColor: p.soft, backgroundImage: `radial-gradient(${p.accent} 0.9cqw, transparent 1cqw)`, backgroundSize: '6cqw 6cqw', opacity: 0.55 }} />
                    <div className="absolute flex flex-col justify-end shadow-xl" style={{ left: '9cqw', right: '9cqw', bottom: '9cqw', top: '30cqw', padding: '6cqw', borderRadius: '5cqw', background: p.bg }}>
                        {kicker}{heading('mt-[1.5cqw]', 0.72)}
                        <span aria-hidden className="mt-[3cqw] block rounded-full" style={{ height: '1.6cqw', width: '16cqw', background: p.accent }} />
                    </div>
                    <Icon aria-hidden strokeWidth={1.4} className="absolute" style={{ right: '12cqw', top: '34cqw', width: '14cqw', height: '14cqw', color: p.accent, opacity: 0.9 }} />
                </>
            )}
            {layout === 3 && (
                <>
                    {/* Monogram: a giant initial in the corner, the name below an accent bar */}
                    <span aria-hidden className="absolute font-black" style={{ right: '-3cqw', top: '-16cqw', fontSize: '86cqw', lineHeight: 1, color: p.soft }}>{initial}</span>
                    <span aria-hidden className="absolute rounded-full" style={{ left: '7cqw', bottom: `${fit * 3.4 + 24}cqw`, height: '1.6cqw', width: '16cqw', background: p.accent }} />
                    <div className="absolute inset-x-0 bottom-0 p-[7cqw]">{kicker}{heading('mt-[1.5cqw]')}</div>
                </>
            )}
            {logo}
        </div>
    );
};
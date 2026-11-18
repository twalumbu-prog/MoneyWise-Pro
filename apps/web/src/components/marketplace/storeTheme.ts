import type { CSSProperties } from 'react';

/**
 * A store's look. Sellers pick a colour, light or dark, a type style, how rounded things are, a banner and a layout for their items, so
 * stores feel different from each other. The page structure never changes (banner, search and categories, items, reviews), so every store
 * works the same way. Only these few choices are open, which keeps every combination readable.
 */
export type StoreMode = 'light' | 'dark';
export type StoreFont = 'modern' | 'classic' | 'bold';
export type StoreCorners = 'soft' | 'round' | 'sharp';
export type StoreLayout = 'grid' | 'menu' | 'showcase' | 'services';

export interface StoreTheme {
    accent: string;
    mode: StoreMode;
    font: StoreFont;
    corners: StoreCorners;
    layout: StoreLayout;
    tagline: string;
    bannerUrl: string | null;
    /** The store's cover photos (the first is the main one), and the cover for the seller's auctions. */
    covers: string[];
    auctionCoverUrl: string | null;
    /** Delivery offered on everything in the store (Lusaka only for now). */
    delivery: { enabled: boolean; charge: number; note: string };
    contact: { show: boolean; whatsapp: string; hours: string };
}

export const DEFAULT_THEME: StoreTheme = { accent: '#0B57D0', mode: 'light', font: 'modern', corners: 'soft', layout: 'grid', tagline: '', bannerUrl: null, covers: [], auctionCoverUrl: null, delivery: { enabled: false, charge: 0, note: '' }, contact: { show: false, whatsapp: '', hours: '' } };

export const PRESETS: { name: string; accent: string; mode: StoreMode }[] = [
    { name: 'Ocean', accent: '#0B57D0', mode: 'light' },
    { name: 'Tangerine', accent: '#F59E0B', mode: 'dark' },
    { name: 'Forest', accent: '#166534', mode: 'light' },
    { name: 'Berry', accent: '#BE185D', mode: 'light' },
    { name: 'Ember', accent: '#EF4444', mode: 'dark' },
    { name: 'Violet', accent: '#7C3AED', mode: 'dark' },
    { name: 'Teal', accent: '#0F766E', mode: 'light' },
    { name: 'Slate', accent: '#334155', mode: 'light' },
];

export const LAYOUTS: { id: StoreLayout; label: string; hint: string }[] = [
    { id: 'grid', label: 'Grid', hint: 'Pictures first. Good for products.' },
    { id: 'menu', label: 'Menu', hint: 'A list with an Add button. Good for food and services.' },
    { id: 'showcase', label: 'Showcase', hint: 'One big feature, then a grid.' },
    { id: 'services', label: 'Services', hint: 'Cards with a description and a Book button. Good for consultancies.' },
];

const RADIUS: Record<StoreCorners, { card: string; control: string; pill: string }> = {
    soft: { card: '18px', control: '12px', pill: '9999px' },
    round: { card: '30px', control: '9999px', pill: '9999px' },
    sharp: { card: '6px', control: '6px', pill: '6px' },
};

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
export const cleanTheme = (raw: any): StoreTheme => ({
    accent: isHex(raw?.accent) ? raw.accent : DEFAULT_THEME.accent,
    mode: raw?.mode === 'dark' ? 'dark' : 'light',
    font: ['modern', 'classic', 'bold'].includes(raw?.font) ? raw.font : 'modern',
    corners: ['soft', 'round', 'sharp'].includes(raw?.corners) ? raw.corners : 'soft',
    layout: ['grid', 'menu', 'showcase', 'services'].includes(raw?.layout) ? raw.layout : 'grid',
    tagline: String(raw?.tagline ?? '').slice(0, 80),
    bannerUrl: typeof raw?.bannerUrl === 'string' && /^https?:\/\//.test(raw.bannerUrl) ? raw.bannerUrl : null,
    covers: (Array.isArray(raw?.covers) ? raw.covers : []).filter((u: unknown): u is string => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 5),
    auctionCoverUrl: typeof raw?.auctionCoverUrl === 'string' && /^https?:\/\//.test(raw.auctionCoverUrl) ? raw.auctionCoverUrl : null,
    delivery: { enabled: raw?.delivery?.enabled === true, charge: Number(raw?.delivery?.charge) || 0, note: String(raw?.delivery?.note ?? '') },
    contact: { show: raw?.contact?.show === true, whatsapp: String(raw?.contact?.whatsapp ?? ''), hours: String(raw?.contact?.hours ?? '') },
});

/** Black or white, whichever reads better on this colour. */
export function inkOn(hex: string): string {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111111' : '#FFFFFF';
}

/** The accent, adjusted so it stays readable as text on the store's background (very dark accents on dark stores, light ones on light). */
function textAccent(hex: string, mode: StoreMode): string {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const mix = (to: number, t: number) => '#' + [r, g, b].map((c) => Math.round(c + (to - c) * t).toString(16).padStart(2, '0')).join('');
    if (mode === 'dark' && lum < 0.35) return mix(255, 0.5);
    if (mode === 'light' && lum > 0.6) return mix(0, 0.45);
    return hex;
}

/** CSS variables the store page and its pieces read, so no component hard-codes a store's colours. */
export function themeVars(t: StoreTheme): CSSProperties {
    const dark = t.mode === 'dark';
    const r = RADIUS[t.corners];
    return {
        '--s-accent': t.accent,
        '--s-accent-ink': inkOn(t.accent),
        '--s-accent-text': textAccent(t.accent, t.mode),
        '--s-bg': dark ? '#141414' : '#FFFFFF',
        '--s-surface': dark ? '#1F1F1F' : '#F6F6F7',
        '--s-text': dark ? '#F4F4F5' : '#1F1F1F',
        '--s-muted': dark ? '#A1A1AA' : '#5F6368',
        '--s-line': dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
        '--s-card': r.card, '--s-control': r.control, '--s-pill': r.pill,
        color: dark ? '#F4F4F5' : '#1F1F1F',
        backgroundColor: dark ? '#141414' : '#FFFFFF',
    } as CSSProperties;
}

/** The heading style for the chosen type style. */
export const headingClass = (f: StoreFont): string =>
    f === 'classic' ? 'font-serif font-bold tracking-tight' : f === 'bold' ? 'font-extrabold uppercase tracking-tight' : 'font-bold';

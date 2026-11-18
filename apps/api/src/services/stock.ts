import { randomUUID } from 'crypto';

/**
 * Stock for a product: a single count, or a count for each option (a colour, a size, or both). A product that doesn't track stock is
 * always available.
 */
export interface Variant { id: string; name: string; color: string; size: string; stock: number }

const clean = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

/** Options as a seller sent them, made safe: up to 40, each with a name, whole-number stock and an id. */
export function cleanVariants(raw: unknown): Variant[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: Variant[] = [];
    for (const r of raw.slice(0, 40)) {
        const color = clean(r?.color, 30), size = clean(r?.size, 30);
        const name = clean(r?.name, 60) || [color, size].filter(Boolean).join(' / ');
        if (!name) continue;
        let id = clean(r?.id, 40);
        if (!id || seen.has(id)) id = randomUUID();
        seen.add(id);
        out.push({ id, name, color, size, stock: Math.min(1_000_000, Math.max(0, Math.floor(Number(r?.stock) || 0))) });
    }
    return out;
}

export interface StockView {
    tracked: boolean;
    /** How many can be bought in all; null when stock isn't tracked. */
    available: number | null;
    threshold: number;
    /** Tracked and running low (but not out). */
    low: boolean;
    soldOut: boolean;
    variants: Variant[];
}

export function stockView(p: any): StockView {
    const tracked = !!p?.track_stock;
    const variants: Variant[] = tracked && Array.isArray(p?.variants) ? cleanVariants(p.variants) : [];
    const threshold = Math.max(0, Number(p?.low_stock_threshold ?? 5) || 0);
    if (!tracked) return { tracked: false, available: null, threshold, low: false, soldOut: false, variants: [] };
    const available = variants.length ? variants.reduce((s, v) => s + v.stock, 0) : Math.max(0, Number(p?.stock_quantity) || 0);
    return { tracked, available, threshold, low: available > 0 && available <= threshold, soldOut: available <= 0, variants };
}

/** Lets a missing stock column (before the migration) read as "not tracked" instead of failing. */
export const STOCK_COLUMNS = 'track_stock, stock_quantity, low_stock_threshold, variants';

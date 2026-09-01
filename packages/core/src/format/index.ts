/**
 * Presentation helpers both clients must agree on.
 *
 * Money formatting lives here rather than in either app because a mismatch
 * between what the web shows and what the app shows for the same row is a
 * defect in a finance product, even when the underlying number is identical.
 */

/** Zambian kwacha, always two decimals. `K1,234.50`. */
export function formatKwacha(amount: number | string | null | undefined): string {
    const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    return `K${safe.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

/** Compact form for dense lists and chart axes: `K1.2k`, `K3.4M`. */
export function formatKwachaCompact(amount: number | null | undefined): string {
    const n = amount ?? 0;
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `K${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `K${(n / 1_000).toFixed(1)}k`;
    return formatKwacha(n);
}

export interface DateGroup<T> {
    /** `YYYY-MM-DD`, local time — the sort key. */
    dateKey: string;
    /** `Monday - 01/09/2026`, matching the web inbox. */
    dateLabel: string;
    items: T[];
}

/**
 * Groups rows into day buckets, newest first by default.
 *
 * Local time on purpose: a requisition raised at 23:30 in Lusaka belongs to
 * that day for the person who raised it, not to the next UTC day.
 */
export function groupByDate<T>(
    rows: T[],
    getDate: (row: T) => string | Date,
    order: 'desc' | 'asc' = 'desc',
): DateGroup<T>[] {
    const buckets = new Map<string, { date: Date; items: T[] }>();

    for (const row of rows) {
        const raw = getDate(row);
        const d = toLocalDate(raw);
        if (!d) continue; // skip unparseable rather than crash a list
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!buckets.has(key)) buckets.set(key, { date: d, items: [] });
        buckets.get(key)!.items.push(row);
    }

    return [...buckets.entries()]
        .sort(([a], [b]) => (order === 'desc' ? b.localeCompare(a) : a.localeCompare(b)))
        .map(([dateKey, { date }]) => ({
            dateKey,
            dateLabel: `${date.toLocaleDateString('en-US', { weekday: 'long' })} - ${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`,
            items: buckets.get(dateKey)!.items,
        }));
}

/**
 * Parses a value as a LOCAL calendar date.
 *
 * A bare `YYYY-MM-DD` is defined by ECMAScript to parse as UTC midnight, so
 * reading `.getDate()` off it shifts back a day anywhere west of Greenwich.
 * Ledger rows carry date-only strings, so a Lusaka user is fine but the bug is
 * real — it is grouped by the calendar day the value names, not by an instant.
 */
function toLocalDate(value: string | Date): Date | null {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
        const [, y, m, day] = dateOnly;
        return new Date(Number(y), Number(m) - 1, Number(day));
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** `01/09/2026` */
export function formatShortDate(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const d = toLocalDate(value);
    if (!d) return '—';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Relative age for "updated 3h ago" style labels. */
export function formatRelative(value: string | Date | null | undefined, now = Date.now()): string {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const secs = Math.round((now - d.getTime()) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatShortDate(d);
}

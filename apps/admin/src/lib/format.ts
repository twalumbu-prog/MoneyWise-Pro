import { RECON_TOLERANCE } from './constants';

/** Format a Kwacha amount, e.g. 1234.5 -> "K1,234.50", -8.4 -> "-K8.40". */
export function money(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return `${sign}K${abs}`;
}

/** A difference is "clean" when it's within the codebase reconciliation tolerance. */
export function isWithinTolerance(diff: number | null | undefined): boolean {
    if (diff === null || diff === undefined) return false;
    return Math.abs(diff) < RECON_TOLERANCE;
}

export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

export function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

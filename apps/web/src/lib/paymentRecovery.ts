/**
 * Client-side recovery for in-flight mobile money collections.
 *
 * Mobile money confirmation can take 30–60s, and customers on flaky connections
 * often refresh or briefly lose the page mid-wait. Because the payment is tracked
 * server-side by its reference (the webhook/verify-status finalises it regardless
 * of the browser), we persist just enough here to RESUME watching that same
 * reference after a reload — so a slow-but-successful payment is never "lost" from
 * the customer's point of view.
 *
 * Scoped to one active payment at a time, per checkout surface (contextId is the
 * wallet_id for the catalogue portal or the link token for a one-time link).
 * Expires after 15 minutes — the same window the server uses to clean up stale
 * pending intents — so a long-abandoned entry never resurfaces.
 */

export interface SavedPayment {
    reference: string;
    contextId: string; // wallet_id (catalogue) or token (payment link)
    orgId: string;
    phone: string;
    amount: number;
    businessName: string;
    startedAt: number; // epoch ms
}

const KEY = 'mw_pending_payment';
const TTL_MS = 15 * 60 * 1000;

export function savePendingPayment(p: SavedPayment): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
        /* private mode / storage disabled — recovery just won't be available */
    }
}

export function loadPendingPayment(contextId: string): SavedPayment | null {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const p = JSON.parse(raw) as SavedPayment;
        if (!p || p.contextId !== contextId || !p.reference) return null;
        if (Date.now() - p.startedAt > TTL_MS) {
            localStorage.removeItem(KEY);
            return null;
        }
        return p;
    } catch {
        return null;
    }
}

export function clearPendingPayment(): void {
    try {
        localStorage.removeItem(KEY);
    } catch {
        /* no-op */
    }
}

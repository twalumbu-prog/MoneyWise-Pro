import type { Request } from 'express';

/**
 * Resolve the frontend origin to embed in outbound links generated on behalf of
 * an admin action (e.g. the "Pay now" button in a one-time payment link email).
 *
 * Server env vars (FRONTEND_URL / NODE_ENV) are a single static value baked in
 * at deploy time — if they're missing or wrong on the deployed API, every link
 * silently falls back to localhost even in production. Instead, when a request
 * is available we detect the origin live from the admin's own browser (the
 * Origin header, falling back to Referer) — whatever host they're actually using
 * right now, localhost:5173 in dev or the deployed domain in prod, is what gets
 * embedded. Origin/Referer are client-supplied, so the candidate is checked
 * against an allowlist before being trusted; anything else falls through to the
 * env-based default, same as before this existed.
 */

const PROD_URL = 'https://moneywise.blueopus.cloud';
const DEV_URL = 'http://localhost:5173';

function isAllowedOrigin(origin: string): boolean {
    let hostname: string;
    let protocol: string;
    try {
        ({ hostname, protocol } = new URL(origin));
    } catch {
        return false;
    }
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (hostname === 'moneywise.blueopus.cloud' || hostname.endsWith('.blueopus.cloud')) return true;

    const configured = process.env.FRONTEND_URL;
    if (configured) {
        try {
            if (new URL(configured).hostname === hostname) return true;
        } catch { /* malformed env value — ignore */ }
    }
    return false;
}

export function getFrontendUrl(req?: Request): string {
    if (req) {
        const origin = req.headers.origin;
        if (typeof origin === 'string' && isAllowedOrigin(origin)) {
            return origin.replace(/\/$/, '');
        }

        const referer = req.headers.referer;
        if (typeof referer === 'string') {
            try {
                const refOrigin = new URL(referer).origin;
                if (isAllowedOrigin(refOrigin)) return refOrigin;
            } catch { /* malformed referer — ignore */ }
        }
    }

    if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, '');
    return process.env.NODE_ENV === 'production' ? PROD_URL : DEV_URL;
}

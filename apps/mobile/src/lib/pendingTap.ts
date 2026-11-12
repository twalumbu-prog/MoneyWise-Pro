import { cacheStoreSync } from '../platform/storage';

const KEY = 'pending-tap-code';
const MAX_AGE_MS = 10 * 60_000;

/** A request link opened while signed out: remembered so the person lands on it after signing in. */
export function rememberTapCode(code: string): void {
    try { cacheStoreSync.setItem(KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* storage unavailable */ }
}

/** The remembered request, once. Old ones (more than ten minutes) are dropped. */
export function takeTapCode(): string | null {
    try {
        const raw = cacheStoreSync.getItem(KEY);
        if (!raw) return null;
        cacheStoreSync.removeItem(KEY);
        const { code, at } = JSON.parse(raw);
        return typeof code === 'string' && Date.now() - Number(at) < MAX_AGE_MS ? code : null;
    } catch { return null; }
}

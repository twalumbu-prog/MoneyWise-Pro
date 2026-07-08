import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_LOOKBACK_MS = 30 * 60 * 1000;

/**
 * Read (and seed, on first-ever visit) the persisted "last seen" cutoff for a
 * key. First-ever visits look back a short window rather than starting from
 * "now", so an action the user just completed — e.g. a payment made moments
 * before opening the page — still lights up instead of being swallowed.
 */
export function readStoredCutoff(storageKey: string, lookbackMs = DEFAULT_LOOKBACK_MS): number {
    const stored = localStorage.getItem(storageKey);
    if (stored) return Number(stored);
    const seeded = Date.now() - lookbackMs;
    localStorage.setItem(storageKey, String(seeded));
    return seeded;
}

/**
 * Pure check against a key's stored cutoff — no timers involved. Used for
 * aggregate indicators (e.g. the toggle dot summarising several wallets, each
 * with its own key) that must persist until *that* item's own list view has
 * actually displayed it and run its fade window.
 */
export function isNewSinceStored(storageKey: string, dateStr?: string | null, lookbackMs = DEFAULT_LOOKBACK_MS): boolean {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    return !isNaN(t) && t > readStoredCutoff(storageKey, lookbackMs);
}

/**
 * Tracks "new since last visit" items for a list view, Gmail-unread style.
 *
 * On mount (and whenever `storageKey` changes — e.g. the user swipes to a
 * different wallet) it freezes a cutoff timestamp from localStorage. Anything
 * created after that cutoff counts as "new" via `isNew(...)`.
 *
 * The highlight does NOT fade on a mount-based timer — that made badges blip
 * away while a slow sync was still spinning. The caller invokes `observe()`
 * only once the new items are actually rendered on the visible view; that arms
 * a one-shot `graceMs` countdown, after which the cutoff advances to "now"
 * (persisted, and re-rendering so the glow clears). Advancing the cutoff rather
 * than latching a hard "expired" flag means a *fresh* item that lands after the
 * fade — e.g. a second payment while the page stays open — still lights up.
 * Switching keys mid-countdown cancels the timer, so glancing away from a
 * wallet before the window elapses keeps its items marked new.
 *
 * IMPORTANT: compare against each item's full `created_at` timestamp, not the
 * day-granular `date` column — a `date` of "2026-07-08" parses to midnight UTC,
 * which is almost always earlier than the cutoff and would never read as new.
 */
export function useNewnessTracker(
    storageKey: string | null,
    graceMs = 18000,
    firstVisitLookbackMs = DEFAULT_LOOKBACK_MS,
) {
    const cutoffRef = useRef<number>(0);
    const keyRef = useRef<string | null>(null);
    const [ready, setReady] = useState(false);
    // Bumped whenever the cutoff advances, purely to re-render so `isNew`
    // (which reads the ref) is re-evaluated and stale badges clear.
    const [, forceTick] = useState(0);
    const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Freeze the cutoff per storageKey; re-freeze when the key changes (wallet
    // switch) and cancel any countdown armed for the previous key.
    useEffect(() => {
        keyRef.current = storageKey;
        if (!storageKey) {
            setReady(false);
            return;
        }
        cutoffRef.current = readStoredCutoff(storageKey, firstVisitLookbackMs);
        setReady(true);
        return () => {
            if (fadeTimer.current) {
                clearTimeout(fadeTimer.current);
                fadeTimer.current = null;
            }
        };
    }, [storageKey, firstVisitLookbackMs]);

    // Reads cutoffRef.current live (not a captured value), so it stays correct
    // across cutoff advances without needing to be in the dependency array.
    const isNew = useCallback((dateStr?: string | null): boolean => {
        if (!ready || !dateStr || !cutoffRef.current) return false;
        const t = new Date(dateStr).getTime();
        return !isNaN(t) && t > cutoffRef.current;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready]);

    // Arm the fade countdown. Call this only when the new items are actually
    // rendered on the visible view (data loaded, correct wallet selected) so
    // the user gets the full `graceMs` of visible highlight. Idempotent while
    // a countdown is pending; re-armable afterwards for later arrivals.
    const observe = useCallback(() => {
        if (!storageKey || fadeTimer.current) return;
        fadeTimer.current = setTimeout(() => {
            // Guard against a key switch racing the timeout.
            if (keyRef.current !== storageKey) return;
            const now = Date.now();
            cutoffRef.current = now;
            localStorage.setItem(storageKey, String(now));
            fadeTimer.current = null;
            forceTick(t => t + 1);
        }, graceMs);
    }, [storageKey, graceMs]);

    return { isNew, observe };
}

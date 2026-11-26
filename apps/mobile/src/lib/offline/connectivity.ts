import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';

/**
 * Is the phone really able to reach MoneyWise? "Wi-Fi connected" is not the answer on Zambian networks: a phone can show signal and
 * still move nothing. So this asks the only question that matters: does the API answer? (Any answer counts, even an error page.)
 *
 * It needs no native module, so it works in the app as it is installed today. It learns about outages two ways: a small ping every
 * few seconds while the app is open (faster while offline, so recovery is noticed quickly), and from the app's own requests: when one
 * fails at the network level the app is marked offline straight away.
 */

const API_URL: string = ((Constants.expoConfig?.extra as any)?.apiUrl ?? '').replace(/\/$/, '');
const PING_ONLINE_MS = 45_000;
const PING_OFFLINE_MS = 8_000;
// Generous: a sleeping server (a Vercel preview, a cold start) can take several seconds to answer, and that is not "offline".
const PING_TIMEOUT_MS = 12_000;
/** A second look before saying "offline": one slow or dropped ping is not an outage. */
const RECHECK_MS = 3_000;

let online = true;
const listeners = new Set<() => void>();
const transitions = new Set<(online: boolean) => void>();

function set(next: boolean) {
    if (next === online) return;
    online = next;
    listeners.forEach((l) => l());
    transitions.forEach((t) => t(next));
}

export const isOnline = () => online;
export const markOffline = () => set(false);
export const markOnline = () => set(true);

/** Runs when the phone goes offline or comes back. Returns a function that stops listening. */
export const onConnectivityChange = (fn: (online: boolean) => void) => { transitions.add(fn); return () => { transitions.delete(fn); }; };

/** True for the errors a dropped connection produces (not for the server saying no). */
export function isNetworkError(e: unknown): boolean {
    const msg = String((e as any)?.message ?? e ?? '');
    return e instanceof TypeError || /network request failed|failed to fetch|network error|timed out|timeout|aborted|load failed|offline/i.test(msg);
}

async function ping(): Promise<boolean> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
    try {
        await fetch(`${API_URL}/`, { method: 'GET', signal: ctrl.signal });
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(t);
    }
}

/** Asks the API whether it can be reached right now. While online, it takes two failed pings in a row to say "offline". */
export async function probe(): Promise<boolean> {
    if (!API_URL) return online;
    let ok = await ping();
    if (!ok && online) {
        await new Promise((r) => setTimeout(r, RECHECK_MS));
        ok = await ping();
    }
    if (ok) markOnline(); else markOffline();
    return ok;
}

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
        if (AppState.currentState === 'active') await probe();
        schedule();
    }, online ? PING_ONLINE_MS : PING_OFFLINE_MS);
}

/** Starts watching. Safe to call more than once. */
export function startConnectivityWatch() {
    if (started) return;
    started = true;
    void probe();
    schedule();
    AppState.addEventListener('change', (s) => { if (s === 'active') void probe(); });
    // Re-time the ping whenever the state flips (fast while offline).
    transitions.add(() => schedule());
}

export function useOnline(): boolean {
    return useSyncExternalStore(
        (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
        () => online,
        () => true,
    );
}

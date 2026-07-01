import { supabase } from './supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

// ── In-memory access-token cache ─────────────────────────────────────────────
// supabase.auth.getSession() serializes on an auth lock (navigator.locks). A
// burst of parallel apiFetch calls (e.g. the dashboard loading several endpoints
// at once) can queue behind an in-flight token refresh and each hit the getSession
// timeout below. Caching the current token in memory — kept fresh by
// onAuthStateChange — lets those parallel calls skip getSession entirely, which is
// the contention that used to cascade into a forced sign-out.
let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0; // epoch seconds

supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
        cachedToken = null;
        cachedTokenExpiresAt = 0;
    } else {
        cachedToken = session.access_token ?? null;
        cachedTokenExpiresAt = session.expires_at ?? 0;
    }
});

function cachedTokenIsFresh(): boolean {
    // 30s guard so we never hand out a token that's about to expire mid-request.
    return !!cachedToken && cachedTokenExpiresAt - Date.now() / 1000 > 30;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
    ]);
}

// ── Deduped token refresh ────────────────────────────────────────────────────
// Distinguishes a genuinely-dead session (refresh token rejected) from a transient
// Supabase Auth hiccup (network / 5xx / timeout). Only the former should ever sign
// the user out; the latter must preserve the session so a valid user isn't kicked
// out over a momentary blip. Mirrors the backend's transient-error handling.
type RefreshResult =
    | { status: 'refreshed'; token: string }
    | { status: 'invalid' }    // refresh token rejected → session genuinely gone
    | { status: 'transient' }; // network/5xx/timeout → Auth degraded, keep session

let inFlightRefresh: Promise<RefreshResult> | null = null;

function refreshAccessToken(): Promise<RefreshResult> {
    // Collapse concurrent refreshes (a storm of parallel 401s) into one network call.
    if (!inFlightRefresh) {
        inFlightRefresh = (async (): Promise<RefreshResult> => {
            try {
                const { data, error }: any = await withTimeout(
                    supabase.auth.refreshSession(), 8000, 'Refresh timeout'
                );
                if (error) {
                    // auth-js tags network / 5xx failures as retryable. Anything else
                    // (invalid / expired / missing refresh token) means the session is dead.
                    return error.name === 'AuthRetryableFetchError'
                        ? { status: 'transient' }
                        : { status: 'invalid' };
                }
                const token = data?.session?.access_token;
                return token ? { status: 'refreshed', token } : { status: 'invalid' };
            } catch {
                // Our own timeout, or a thrown network error → treat as transient.
                return { status: 'transient' };
            }
        })();
        // Clear the singleton once settled so a later 401 can refresh again.
        inFlightRefresh.finally(() => { inFlightRefresh = null; });
    }
    return inFlightRefresh;
}

async function getAccessToken(): Promise<string | null> {
    if (cachedTokenIsFresh()) return cachedToken;
    try {
        const result: any = await withTimeout(supabase.auth.getSession(), 5000, 'Session fetch timeout');
        const token = result?.data?.session?.access_token;
        if (token) return token;
        return null;
    } catch (err) {
        // getSession hung on the auth lock. Rather than fire a token-less request
        // (guaranteed 401 → forced logout), try a direct refresh to recover a token.
        console.warn('[API Client] Session fetch failed or timed out; attempting refresh:', err);
        const refresh = await refreshAccessToken();
        return refresh.status === 'refreshed' ? refresh.token : null;
    }
}

function sendRequest(path: string, options: RequestInit, token: string | null) {
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };
    return fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, { ...options, headers });
}

export async function apiFetch(path: string, options: RequestInit = {}) {
    console.log(`[API Client] Fetching: ${path}`);

    const token = await getAccessToken();
    let response = await sendRequest(path, options, token);
    console.log(`[API Client] Response status: ${response.status} for ${path}`);

    if (response.status === 401) {
        // A 401 is NOT proof the session is dead. Most 401s here are self-inflicted:
        // getSession lost a race with a token refresh (auth-lock contention), or a
        // backgrounded tab's token expired, so we sent a stale/absent token. Attempt
        // exactly ONE refresh + retry before doing anything destructive.
        const refresh = await refreshAccessToken();
        if (refresh.status === 'refreshed') {
            response = await sendRequest(path, options, refresh.token);
            console.log(`[API Client] Retry after refresh: ${response.status} for ${path}`);
        }

        if (response.status === 401) {
            if (refresh.status === 'invalid') {
                // The refresh token itself was rejected — the session is genuinely
                // gone. Only now is a sign-out correct. The onAuthStateChange listener
                // in AuthContext handles the state reset + redirect to login.
                console.warn('[API Client] Session invalid. Signing out...');
                await supabase.auth.signOut();
            } else {
                // Transient Auth degradation (or a fresh token bounced by a backend
                // mid-deploy). Keep the session and let the caller retry — do NOT
                // kick a valid user out over a momentary blip.
                console.warn('[API Client] Transient 401 — keeping session, not signing out.');
            }
            throw new Error('Unauthorized');
        }
    }

    if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            let errorMsg = '';
            const rawError = errorData.error || errorData.message;
            if (rawError && typeof rawError === 'object') {
                errorMsg = rawError.Fault?.Error?.[0]?.Detail
                    || rawError.Fault?.Error?.[0]?.Message
                    || rawError.message
                    || JSON.stringify(rawError);
            } else {
                errorMsg = rawError || `API Error: ${response.status}`;
            }
            throw new Error(errorMsg);
        } else {
            const text = await response.text();
            console.error('[API Client] Non-JSON error response:', text.slice(0, 500));
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
    }

    return response;
}

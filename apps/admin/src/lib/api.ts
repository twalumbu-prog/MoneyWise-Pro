import { supabase } from './supabase';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * supabase.auth.getSession() can HANG when the stored token is expired and the
 * background refresh stalls (network issue / unrefreshable token). Left unguarded
 * that hangs the whole app on a spinner. Race it with a timeout → null (treated as
 * logged out) so the UI degrades to the login screen instead of an endless spinner.
 */
export async function getSessionSafe(timeoutMs = 5000) {
    try {
        const res: any = await Promise.race([
            supabase.auth.getSession(),
            new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), timeoutMs)),
        ]);
        return res?.data?.session ?? null;
    } catch {
        return null;
    }
}

/**
 * Authenticated GET against the MoneyWise API using the current Supabase session.
 * Times out (AbortController) so a slow/hung upstream (e.g. a stalled Lenco call)
 * surfaces as an error instead of an endless spinner.
 */
export async function apiGet<T>(path: string, timeoutMs = 90000): Promise<T> {
    return apiSend<T>('GET', path, undefined, timeoutMs);
}

export async function apiPost<T>(path: string, body?: unknown, timeoutMs = 30000): Promise<T> {
    return apiSend<T>('POST', path, body, timeoutMs);
}

export async function apiPatch<T>(path: string, body?: unknown, timeoutMs = 30000): Promise<T> {
    return apiSend<T>('PATCH', path, body, timeoutMs);
}

export async function apiPut<T>(path: string, body?: unknown, timeoutMs = 30000): Promise<T> {
    return apiSend<T>('PUT', path, body, timeoutMs);
}

async function apiSend<T>(method: string, path: string, body: unknown, timeoutMs: number): Promise<T> {
    const session = await getSessionSafe();
    if (!session) throw new ApiError(401, 'Not signed in');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, {
            method,
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });

        if (!res.ok) {
            let message = res.statusText;
            try {
                const body = await res.json();
                message = body?.error || message;
            } catch {
                /* non-JSON error body */
            }
            throw new ApiError(res.status, message);
        }
        return (await res.json()) as T;
    } catch (err) {
        if (err instanceof ApiError) throw err;
        if ((err as any)?.name === 'AbortError') {
            throw new ApiError(504, 'The request timed out. The API or Lenco may be slow — try again.');
        }
        throw new ApiError(0, (err as any)?.message || 'Network error reaching the API');
    } finally {
        clearTimeout(timer);
    }
}

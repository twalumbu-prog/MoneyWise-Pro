/**
 * Web implementation of the `core` Platform adapter.
 *
 * The native app supplies the same shape from expo-secure-store / MMKV /
 * expo-image-picker. Anything that reads `import.meta.env`, `window`, or
 * `localStorage` on behalf of core belongs in this file and nowhere else.
 */

import { configureCore, type KeyValueStore, type StreamAdapter } from 'core';
import { supabase } from './supabase';
import { trackEvent } from './analytics';

const localStore: KeyValueStore = {
    async get(key) {
        try { return window.localStorage.getItem(key); } catch { return null; }
    },
    async set(key, value) {
        try { window.localStorage.setItem(key, value); } catch { /* quota / private mode */ }
    },
    async remove(key) {
        try { window.localStorage.removeItem(key); } catch { /* no-op */ }
    },
};

/**
 * SSE transport for the streaming assistant. Reads the fetch body directly —
 * this is the code agentClient used to own before it moved into core.
 * A non-2xx response is thrown as an Error carrying `status` and the parsed
 * JSON `body`, which is what lets core recover a dropped 409-pending approval
 * instead of just surfacing a dead-end error.
 */
const webStream: StreamAdapter = async function* (url, init) {
    let response: Response;
    try {
        response = await fetch(url, init);
    } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
        throw new Error('Stream failed: network error');
    }

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        const err: any = new Error(body?.error ?? `Stream failed: ${response.status}`);
        err.status = response.status;
        err.body = body;
        throw err;
    }
    if (!response.body) {
        throw new Error('Stream failed: no readable body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            yield decoder.decode(value, { stream: true });
        }
        const tail = decoder.decode();
        if (tail) yield tail;
    } finally {
        await reader.cancel().catch(() => {});
    }
};

export function initCore(): void {
    configureCore({
        supabase,
        env: {
            apiUrl: (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, ''),
            supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
            supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
            appVersion: import.meta.env.VITE_APP_VERSION || 'dev',
            isProduction: !!import.meta.env.PROD,
        },
        storage: localStore,
        // On web these are the same store. On native they are emphatically not:
        // the query cache goes to MMKV, credentials go to the Keychain/Keystore.
        secureStorage: localStore,
        telemetry: { track: trackEvent },
        randomUUID: () => crypto.randomUUID(),
        now: () => performance.now(),
        stream: webStream,
    });
}

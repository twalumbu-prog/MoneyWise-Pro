/**
 * Web implementation of the `core` Platform adapter.
 *
 * The native app supplies the same shape from expo-secure-store / MMKV /
 * expo-image-picker. Anything that reads `import.meta.env`, `window`, or
 * `localStorage` on behalf of core belongs in this file and nowhere else.
 */

import { configureCore, type KeyValueStore } from 'core';
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
    });
}

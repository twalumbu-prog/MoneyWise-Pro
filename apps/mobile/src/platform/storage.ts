import { createMMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';
import type { KeyValueStore } from 'core';

/**
 * Bulk cache — the React Query persister and UI preferences.
 *
 * MMKV is synchronous and memory-mapped, which is what makes an instant
 * cold-paint from cache possible; the web app gets the same effect from
 * localStorage. Nothing sensitive goes here.
 */
const mmkv = createMMKV({ id: 'moneywise-cache' });

export const cacheStore: KeyValueStore = {
    async get(key) {
        return mmkv.getString(key) ?? null;
    },
    async set(key, value) {
        mmkv.set(key, value);
    },
    async remove(key) {
        mmkv.remove(key);
    },
};

/** Synchronous view of the same store, for React Query's sync persister. */
export const cacheStoreSync = {
    getItem: (key: string) => mmkv.getString(key) ?? null,
    setItem: (key: string, value: string) => mmkv.set(key, value),
    removeItem: (key: string) => { mmkv.remove(key); },
};

// ── Credentials ──────────────────────────────────────────────────────────────
// SecureStore is backed by the iOS Keychain and Android Keystore, and rejects
// any single value over 2048 bytes. A Supabase session — access token, refresh
// token, and the user object — routinely exceeds that, so values are chunked.
// This is a real failure mode, not a theoretical one: storing the session
// unchunked fails silently on some devices and signs the user out on next launch.
const CHUNK_SIZE = 1800; // headroom under 2048 for the key envelope
const countKey = (key: string) => `${key}__chunks`;

export const secureStore: KeyValueStore = {
    async get(key) {
        const rawCount = await SecureStore.getItemAsync(countKey(key));
        if (rawCount === null) {
            // Not chunked — either a small value or written by an older build.
            return SecureStore.getItemAsync(key);
        }
        const count = Number(rawCount);
        const parts: string[] = [];
        for (let i = 0; i < count; i++) {
            const part = await SecureStore.getItemAsync(`${key}__${i}`);
            // A missing chunk means a partial write (interrupted install/crash).
            // Returning a truncated session would fail auth in a confusing way,
            // so treat it as absent and let the user sign in again.
            if (part === null) return null;
            parts.push(part);
        }
        return parts.join('');
    },

    async set(key, value) {
        await secureStore.remove(key);
        if (value.length <= CHUNK_SIZE) {
            await SecureStore.setItemAsync(key, value);
            return;
        }
        const count = Math.ceil(value.length / CHUNK_SIZE);
        for (let i = 0; i < count; i++) {
            await SecureStore.setItemAsync(
                `${key}__${i}`,
                value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
            );
        }
        // Written last: the count is what makes the chunks readable, so a crash
        // mid-write leaves no count and the value reads as absent rather than partial.
        await SecureStore.setItemAsync(countKey(key), String(count));
    },

    async remove(key) {
        const rawCount = await SecureStore.getItemAsync(countKey(key));
        if (rawCount !== null) {
            const count = Number(rawCount);
            for (let i = 0; i < count; i++) {
                await SecureStore.deleteItemAsync(`${key}__${i}`);
            }
            await SecureStore.deleteItemAsync(countKey(key));
        }
        await SecureStore.deleteItemAsync(key);
    },
};

/** Clears cached financial data. Must run on sign-out — shared devices are common. */
export function clearCache(): void {
    mmkv.clearAll();
}

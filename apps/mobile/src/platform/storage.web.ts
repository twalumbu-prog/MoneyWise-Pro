import type { KeyValueStore } from 'core';

/**
 * Browser version of ./storage.ts (Metro picks this file for the web target).
 *
 * The phone version uses MMKV and the Keychain/Keystore, which don't exist in a browser. Here both stores sit in
 * localStorage. That is fine for running the app on the web while developing, but localStorage is not a secure place for a
 * login session: the real MoneyWise web app is the one to use for customers.
 */
const mem = new Map<string, string>();
const ls = (): Storage | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };
const read = (k: string): string | null => { try { const v = ls()?.getItem(k); return v === undefined ? (mem.get(k) ?? null) : v; } catch { return mem.get(k) ?? null; } };
const write = (k: string, v: string) => { try { const s = ls(); if (s) { s.setItem(k, v); return; } } catch { /* fall back to memory */ } mem.set(k, v); };
const drop = (k: string) => { try { ls()?.removeItem(k); } catch { /* ignore */ } mem.delete(k); };

const CACHE_PREFIX = 'mw-cache:';
const SECURE_PREFIX = 'mw-secure:';

export const cacheStore: KeyValueStore = {
    async get(key) { return read(CACHE_PREFIX + key); },
    async set(key, value) { write(CACHE_PREFIX + key, value); },
    async remove(key) { drop(CACHE_PREFIX + key); },
};

/** Synchronous view of the same store, for React Query's sync persister. */
export const cacheStoreSync = {
    getItem: (key: string) => read(CACHE_PREFIX + key),
    setItem: (key: string, value: string) => write(CACHE_PREFIX + key, value),
    removeItem: (key: string) => { drop(CACHE_PREFIX + key); },
};

export const secureStore: KeyValueStore = {
    async get(key) { return read(SECURE_PREFIX + key); },
    async set(key, value) { write(SECURE_PREFIX + key, value); },
    async remove(key) { drop(SECURE_PREFIX + key); },
};

/** Clears cached financial data. Must run on sign-out. */
export function clearCache(): void {
    try {
        const s = ls();
        if (s) Object.keys(s).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => s.removeItem(k));
    } catch { /* ignore */ }
    for (const k of [...mem.keys()]) if (k.startsWith(CACHE_PREFIX)) mem.delete(k);
}

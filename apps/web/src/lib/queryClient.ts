import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { supabase } from './supabase';

// ── Client-side cache for API data ───────────────────────────────────────────
// Every page used to refetch everything from scratch on mount (raw useEffect →
// apiFetch), which on high-latency mobile networks meant seconds of spinner per
// navigation and "refresh to see data". Queries now paint instantly from cache
// (persisted to localStorage across sessions) and revalidate in the background.

const PERSIST_KEY = 'mwp-query-cache';

// Bust the persisted cache on deploys so stale shapes never hydrate into new
// code. Mirrors APP_VERSION in analytics.ts (VITE_APP_VERSION = git sha).
export const CACHE_BUSTER = import.meta.env.VITE_APP_VERSION || 'dev';

export const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24h

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Cached data is served instantly; anything older than this is
            // refetched in the background while the user already sees content.
            staleTime: 30 * 1000,
            // Keep unused query data around (and persisted) for the full day so
            // returning users get an instant paint before the first network hit.
            gcTime: MAX_CACHE_AGE_MS,
            // Flaky-carrier tolerance: two retries with exponential backoff
            // instead of failing straight to an error screen.
            retry: 2,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
        },
    },
});

export const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: PERSIST_KEY,
    // Batch writes; financial lists can be chunky and localStorage is sync.
    throttleTime: 1000,
});

// Cached financial data must never survive a sign-out on a shared device, and
// must never leak across accounts. Clearing on SIGNED_OUT covers both (the
// next SIGNED_IN starts from an empty cache).
supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
        queryClient.clear();
        window.localStorage.removeItem(PERSIST_KEY);
    }
});

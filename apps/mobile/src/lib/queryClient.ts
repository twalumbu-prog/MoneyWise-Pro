import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { cacheStoreSync } from '../platform/storage';

/**
 * Mirrors apps/web/src/lib/queryClient.ts. The policy matters more here, not
 * less: the app is used on Zambian mobile networks, so screens must paint from
 * cache immediately and revalidate behind the user.
 */
export const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30 * 1000,
            gcTime: MAX_CACHE_AGE_MS,
            retry: 2,
            // No window to focus; React Query's RN focus manager handles AppState.
            refetchOnReconnect: true,
        },
    },
});

export const persister = createSyncStoragePersister({
    storage: cacheStoreSync,
    key: 'mwp-query-cache',
    throttleTime: 1000,
});

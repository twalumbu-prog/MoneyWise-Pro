import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { randomUUID } from 'expo-crypto';
import { configureCore } from 'core';
import { supabase } from '../lib/supabase';
import { cacheStore, secureStore } from './storage';
import { streamAdapter } from './stream';
import { filesAdapter } from './files';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

/**
 * Native implementation of the core Platform adapter — the mirror of
 * apps/web/src/lib/platform.ts. Anything reading a native module on core's
 * behalf belongs here and nowhere else.
 */
export function initCore(): void {
    configureCore({
        supabase,
        env: {
            apiUrl: (extra.apiUrl ?? '').replace(/\/$/, ''),
            supabaseUrl: extra.supabaseUrl ?? '',
            supabaseAnonKey: extra.supabaseAnonKey ?? '',
            appVersion: Constants.expoConfig?.version ?? 'dev',
            isProduction: !__DEV__,
        },
        storage: cacheStore,
        // Unlike web, these are genuinely different stores: the query cache is
        // MMKV, credentials are Keychain/Keystore-backed and chunked.
        secureStorage: secureStore,
        telemetry: {
            track(feature, action, status, props) {
                // PostHog wiring lands with the analytics work in P1; until then
                // this must stay a no-op that never throws, because core calls it
                // on every request.
                if (__DEV__) {
                    console.log(`[telemetry] ${feature}_${action}_${status}`, props);
                }
            },
        },
        randomUUID,
        // performance.now() exists in Hermes and is monotonic, matching web.
        now: () => performance.now(),
        files: filesAdapter,
        stream: streamAdapter,
        openExternal: async (url: string) => {
            await Linking.openURL(url);
        },
    });
}

export { WEB_ORIGIN } from './constants';

import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import type { Database } from 'shared';
import { secureStore } from '../platform/storage';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

/**
 * The native Supabase client. Same project, same anon key, same RLS as the web
 * app — that shared backend is what makes the two clients one synchronised
 * platform rather than two apps that agree by accident.
 *
 * Three differences from the web client, all forced by the platform:
 *  - session lives in the Keychain/Keystore, not localStorage
 *  - detectSessionInUrl is off: there is no URL bar. OAuth and password-reset
 *    links arrive through expo-linking and are exchanged explicitly.
 *  - autoRefreshToken is driven by AppState, since a backgrounded app should
 *    not hold a refresh timer (handled where AppState is observed, in P1).
 */
export const supabase = createClient<Database>(
    extra.supabaseUrl ?? '',
    extra.supabaseAnonKey ?? '',
    {
        auth: {
            storage: {
                getItem: (key) => secureStore.get(key),
                setItem: (key, value) => secureStore.set(key, value),
                removeItem: (key) => secureStore.remove(key),
            },
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
        },
    },
);

import { AppState, type AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

/**
 * PostHog for the iOS and Android apps. Mirrors apps/web/src/lib/usageSession.ts so the same two engagement events
 * mean the same thing on every platform:
 *
 *   app_opened       a cold start, or coming back to the app after 30+ minutes away (a new "session")
 *   app_backgrounded the app left the foreground, with `foreground_seconds` of visible time
 *
 * Feature usage (deposits, sends, invoices, savings…) is recorded by the API as `feature_used`, which covers web,
 * iOS and Android in one place. Disabled (every call a no-op) when no key is configured, and never throws.
 */

export type AccountType = 'business' | 'personal';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const KEY = extra.posthogKey || '';
const HOST = extra.posthogHost || 'https://us.i.posthog.com';

/** A return to the foreground after this long counts as a fresh session/open. */
const NEW_SESSION_AFTER_MS = 30 * 60 * 1000;

let client: PostHog | null = null;
if (KEY) {
    try {
        client = new PostHog(KEY, {
            host: HOST,
            personProfiles: 'identified_only',
            // We emit our own app_opened / app_backgrounded with foreground time and account type attached.
            captureAppLifecycleEvents: false,
            flushAt: 10,
            flushInterval: 15000,
        });
    } catch (err) {
        console.warn('[analytics] PostHog init failed — analytics disabled:', err);
        client = null;
    }
} else if (!__DEV__) {
    console.warn('[analytics] EXPO_PUBLIC_POSTHOG_KEY not set — analytics disabled.');
}

/** Same test the rest of the app uses to tell a personal workspace from a business. */
export function accountTypeFromOrgName(name?: string | null): AccountType {
    const n = (name || '').toLowerCase();
    return n.includes('workspace') || n.includes('personal') || n.includes('individual') ? 'personal' : 'business';
}

interface Identity {
    userId: string;
    organizationId: string | null;
    organizationName: string | null;
    role: string | null;
}

let identity: Identity | null = null;
let opened = false;
let foregroundSince: number | null = null;
let backgroundedAt: number | null = null;
let subscribed = false;

const platform = () => (Constants.platform?.ios ? 'ios' : Constants.platform?.android ? 'android' : 'unknown');

function baseProps() {
    return {
        platform: platform(),
        account_type: accountTypeFromOrgName(identity?.organizationName),
        organization_id: identity?.organizationId ?? null,
        role: identity?.role ?? null,
        app_version: Constants.expoConfig?.version ?? null,
    };
}

function safe(fn: () => void) {
    try { fn(); } catch { /* analytics must never affect the app */ }
}

function onAppState(state: AppStateStatus) {
    if (!client || !identity) return;
    if (state === 'active') {
        const now = Date.now();
        const away = backgroundedAt == null ? 0 : now - backgroundedAt;
        foregroundSince = now;
        backgroundedAt = null;
        if (away >= NEW_SESSION_AFTER_MS) {
            safe(() => client!.capture('app_opened', { ...baseProps(), returning_after_minutes: Math.round(away / 60000) }));
        }
    } else if (foregroundSince != null) {
        const seconds = Math.round((Date.now() - foregroundSince) / 1000);
        foregroundSince = null;
        backgroundedAt = Date.now();
        if (seconds >= 2) {
            safe(() => {
                client!.capture('app_backgrounded', { ...baseProps(), foreground_seconds: seconds });
                // The OS may freeze the app right after this; push the event out now rather than on the timer.
                void client!.flush();
            });
        }
    }
}

/** Call whenever the signed-in user / active organisation is known (login, session restore, organisation switch). */
export function trackIdentified(next: Identity) {
    if (!client) return;
    safe(() => {
        const userChanged = identity?.userId !== next.userId;
        const orgChanged = identity?.organizationId !== next.organizationId;
        identity = next;
        const props = baseProps();

        if (userChanged) {
            client!.identify(next.userId, { role: next.role, organization_id: next.organizationId, organization_name: next.organizationName });
        }
        client!.register({ account_type: props.account_type, organization_id: next.organizationId ?? null, platform: props.platform });
        if (next.organizationId) {
            client!.group('organization', next.organizationId, { name: next.organizationName, account_type: props.account_type });
        }

        if (!opened) {
            opened = true;
            foregroundSince = AppState.currentState === 'active' ? Date.now() : null;
            client!.capture('app_opened', props);
        } else if (orgChanged) {
            // Switching between a personal and a business account is its own signal.
            client!.capture('organization_switched', props);
        }

        if (!subscribed) {
            subscribed = true;
            AppState.addEventListener('change', onAppState);
        }
    });
}

/** Call when the user signs out, so the next person on this device starts clean. */
export function trackSignedOut() {
    if (!client) return;
    safe(() => {
        client!.capture('user_signed_out', baseProps());
        void client!.flush();
        client!.unregister('account_type');
        client!.unregister('organization_id');
        client!.reset();
        identity = null;
        opened = false;
        foregroundSince = null;
        backgroundedAt = null;
    });
}

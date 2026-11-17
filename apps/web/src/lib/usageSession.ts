import posthog from './posthog';

/**
 * Login frequency and time-in-app, per user and per organisation.
 *
 *   app_opened       once each time the app is opened/restored (a "login" for engagement purposes — it also counts
 *                    returning visits that never see the sign-in screen, which `user_signed_in` misses)
 *   app_backgrounded when the tab is hidden/closed, with `foreground_seconds` = time the app was actually visible
 *
 * Average time in app = avg(foreground_seconds) on `app_backgrounded`, per organisation per day. Measuring only
 * visible time keeps a tab left open overnight from inflating the number.
 * Feature usage itself (deposits, sends, invoices…) is recorded by the API as `feature_used`.
 *
 * The mobile apps emit the same two events (apps/mobile/src/lib/analytics.ts) so the numbers add up across platforms.
 */

export type AccountType = 'business' | 'personal';

/** Same test the rest of the app uses to tell a personal workspace from a business (see usePersonalAccount). */
export function accountTypeFromOrgName(name?: string | null): AccountType {
    const n = (name || '').toLowerCase();
    return n.includes('workspace') || n.includes('personal') || n.includes('individual') || n.includes('private') ? 'personal' : 'business';
}

interface Identity {
    userId: string;
    organizationId: string | null;
    organizationName: string | null;
    role: string | null;
}

let opened = false;
let visibleSince: number | null = null;
let identity: Identity | null = null;
let listening = false;

function baseProps() {
    return {
        platform: 'web',
        account_type: accountTypeFromOrgName(identity?.organizationName),
        organization_id: identity?.organizationId ?? undefined,
        role: identity?.role ?? undefined,
    };
}

function flushForeground(reason: 'hidden' | 'signed_out') {
    if (visibleSince == null) return;
    const seconds = Math.round((Date.now() - visibleSince) / 1000);
    visibleSince = null;
    // Sub-second blips (e.g. a tab switch) are noise, not usage.
    if (seconds < 2) return;
    try {
        posthog.capture('app_backgrounded', { ...baseProps(), foreground_seconds: seconds, reason }, { transport: 'sendBeacon' });
    } catch { /* analytics must never affect the app */ }
}

function onVisibility() {
    if (document.visibilityState === 'hidden') {
        flushForeground('hidden');
    } else if (visibleSince == null) {
        visibleSince = Date.now();
    }
}

/** Call whenever the signed-in user / active organisation is known (login, session restore, organisation switch). */
export function trackIdentified(next: Identity) {
    try {
        const orgChanged = identity?.organizationId !== next.organizationId;
        identity = next;
        const props = baseProps();

        posthog.register({ account_type: props.account_type, organization_id: next.organizationId ?? undefined, platform: 'web' });
        if (next.organizationId) {
            posthog.group('organization', next.organizationId, { name: next.organizationName, account_type: props.account_type });
        }

        if (!opened) {
            opened = true;
            visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
            posthog.capture('app_opened', props);
        } else if (orgChanged) {
            // Switching between a personal and a business account is its own signal.
            posthog.capture('organization_switched', props);
        }

        if (!listening) {
            listening = true;
            document.addEventListener('visibilitychange', onVisibility);
            window.addEventListener('pagehide', () => flushForeground('hidden'));
        }
    } catch { /* analytics must never affect the app */ }
}

/** Call just before signing out, so the open session is closed against the right user. */
export function trackSignedOut() {
    try {
        flushForeground('signed_out');
        opened = false;
        identity = null;
        posthog.unregister('account_type');
        posthog.unregister('organization_id');
        posthog.resetGroups();
    } catch { /* analytics must never affect the app */ }
}

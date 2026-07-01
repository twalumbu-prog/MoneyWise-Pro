import posthog from './posthog';

export type EventStatus = 'started' | 'succeeded' | 'failed';

export interface TrackProps {
    workflow_id: string;
    organization_id?: string;
    user_id?: string;
    [key: string]: any;
}

const ENVIRONMENT = import.meta.env.PROD ? 'prod' : 'dev';
// Optional build-time git sha tag; set VITE_APP_VERSION in Vercel to
// $VERCEL_GIT_COMMIT_SHA (Vercel auto-populates that var). Fails soft to
// 'unknown' rather than blocking the build if unset.
const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'unknown';

/**
 * Fire a `<feature>_<action>_<status>` event, enforcing the shared naming
 * convention so call sites can't drift from it ad hoc.
 */
export function trackEvent(
    feature: string,
    action: string,
    status: EventStatus,
    props: TrackProps
): void {
    posthog.capture(`${feature}_${action}_${status}`, {
        feature,
        status,
        environment: ENVIRONMENT,
        app_version: APP_VERSION,
        user_id: props.user_id || 'anonymous',
        ...props,
    });
}

/**
 * Wrap an async handler with started/succeeded/failed + duration_ms. Return
 * value and thrown errors pass through unchanged — pure observation layer.
 */
export async function withTiming<T>(
    feature: string,
    action: string,
    baseProps: TrackProps,
    fn: () => Promise<T>
): Promise<T> {
    const start = performance.now();
    trackEvent(feature, action, 'started', baseProps);
    try {
        const result = await fn();
        trackEvent(feature, action, 'succeeded', {
            ...baseProps,
            duration_ms: Math.round(performance.now() - start),
        });
        return result;
    } catch (err: any) {
        trackEvent(feature, action, 'failed', {
            ...baseProps,
            duration_ms: Math.round(performance.now() - start),
            error_code: err?.code || err?.name || 'UNKNOWN',
            error_message: String(err?.message || err).slice(0, 500),
        });
        throw err;
    }
}

/**
 * The Lenco checkout SDK's own `onSuccess` fired (gateway confirmed payment),
 * but our verifyStatus polling exhausted its retries before we could confirm
 * it ourselves. This is a distinct failure mode from a gateway decline —
 * money may have moved but our confirmation didn't land in time — which is
 * exactly the "silent failure" class this instrumentation exists to catch.
 */
export function trackVerificationTimeout(
    feature: string,
    props: TrackProps & { attempts: number; duration_ms: number }
): void {
    trackEvent(feature, 'checkout', 'failed', {
        ...props,
        error_code: 'verification_timeout',
        error_message: `Gateway reported success but verification polling exhausted after ${props.attempts} attempts`,
    });
}

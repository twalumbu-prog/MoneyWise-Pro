import { posthogClient } from '../lib/posthog';

const ENVIRONMENT = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
// Vercel auto-populates this at build+runtime with no config needed.
const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || 'unknown';

export interface BaseEventProps {
    feature: string;
    workflow_id: string;
    organization_id: string;
    user_id?: string;
    [key: string]: any;
}

/**
 * Fire a single event. Never throws — a PostHog ingestion failure must never
 * surface as an error in money-moving code.
 */
export function captureEvent(eventName: string, props: BaseEventProps): void {
    if (!posthogClient) return;
    try {
        posthogClient.capture({
            distinctId: props.user_id || 'system',
            event: eventName,
            properties: {
                environment: ENVIRONMENT,
                app_version: APP_VERSION,
                ...props,
            },
        });
    } catch (err: any) {
        console.error(`[analytics] captureEvent failed for ${eventName}:`, err?.message || err);
    }
}

/**
 * Wrap an async operation with `${eventBaseName}_started/_succeeded/_failed`
 * events + duration_ms. Return value and thrown errors pass through
 * unchanged — this is purely an observation layer, it never changes control
 * flow. Only sees a failure if `fn` actually rejects, so callers that
 * currently swallow their own errors must let the wrapped inner operation
 * throw and keep their own catch-and-return contract around this call.
 */
export async function withTiming<T>(
    eventBaseName: string,
    baseProps: BaseEventProps,
    fn: () => Promise<T>
): Promise<T> {
    const start = Date.now();
    captureEvent(`${eventBaseName}_started`, { ...baseProps, status: 'started' });
    try {
        const result = await fn();
        captureEvent(`${eventBaseName}_succeeded`, {
            ...baseProps,
            status: 'succeeded',
            duration_ms: Date.now() - start,
        });
        return result;
    } catch (err: any) {
        captureEvent(`${eventBaseName}_failed`, {
            ...baseProps,
            status: 'failed',
            duration_ms: Date.now() - start,
            error_code: err?.code || err?.name || 'UNKNOWN',
            error_message: String(err?.message || err).slice(0, 500),
        });
        throw err;
    }
}

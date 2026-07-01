import { PostHog } from 'posthog-node';

const key = process.env.POSTHOG_KEY || '';
const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

if (!key) {
    console.warn('[PostHog] POSTHOG_KEY not set — backend analytics disabled.');
}

// apps/api runs as a Vercel serverless function (see src/index.ts: `export
// default app`, app.listen() only outside production) rather than a
// long-lived process, so the default background batching/flush interval is
// unsafe here — the invocation can be frozen the instant the HTTP response
// is sent, silently dropping buffered-but-unflushed events. flushAt: 1 +
// flushInterval: 0 make every capture() send immediately instead of batching.
export const posthogClient = key
    ? new PostHog(key, { host, flushAt: 1, flushInterval: 0 })
    : null;

export async function shutdownPostHog(): Promise<void> {
    if (!posthogClient) return;
    try {
        await posthogClient.shutdown();
    } catch (err: any) {
        console.error('[PostHog] shutdown error (non-fatal):', err?.message || err);
    }
}

import posthog from 'posthog-js';

// Prefer the NEXT_PUBLIC_* vars provisioned by the PostHog/Vercel integration,
// falling back to the VITE_* vars used for local development.
// `||` not `??`: Vercel provisions NEXT_PUBLIC_POSTHOG_HOST as an empty string, which must fall through to the next
// source instead of becoming a blank api_host (events would then go to the page's own origin and be lost).
const key =
    import.meta.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ||
    import.meta.env.VITE_POSTHOG_KEY;
const configuredHost =
    import.meta.env.NEXT_PUBLIC_POSTHOG_HOST ||
    import.meta.env.VITE_POSTHOG_HOST ||
    'https://us.i.posthog.com';
// Send through our own domain (the /ingest rewrite in vercel.json) instead of straight to posthog.com. Direct calls to a third-party
// analytics host are blocked by some mobile carriers, ad blockers and corporate networks, which silently drops every event (browser
// events from signed-in users have been near zero since mid-August). The dev server has no rewrite, so it keeps the direct host.
const apiHost = import.meta.env.PROD && /posthog\.com/.test(configuredHost) ? '/ingest' : configuredHost;

if (key) {
    posthog.init(key, {
        api_host: apiHost,
        // Required whenever api_host points at a reverse proxy (not
        // *.posthog.com directly) so toolbar/share links still resolve to the
        // real PostHog UI instead of the proxy domain.
        ui_host: 'https://us.posthog.com',
        person_profiles: 'identified_only',
        // This is a single-page app: count each in-app navigation as a page view (Budget, Savings, Invest, Grow, …), not just the first load.
        capture_pageview: 'history_change',
    });
} else if (import.meta.env.PROD) {
    // Surface a clear signal in the browser console instead of silently
    // initialising PostHog with an undefined key (which captures nothing).
    console.warn(
        '[posthog] No project token found ' +
            '(NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN / VITE_POSTHOG_KEY) — analytics disabled.',
    );
}

export default posthog;

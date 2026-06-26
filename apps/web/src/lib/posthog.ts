import posthog from 'posthog-js';

// Prefer the NEXT_PUBLIC_* vars provisioned by the PostHog/Vercel integration,
// falling back to the VITE_* vars used for local development.
const key =
    import.meta.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ??
    import.meta.env.VITE_POSTHOG_KEY;
const apiHost =
    import.meta.env.NEXT_PUBLIC_POSTHOG_HOST ??
    import.meta.env.VITE_POSTHOG_HOST ??
    'https://us.i.posthog.com';

if (key) {
    posthog.init(key, {
        api_host: apiHost,
        person_profiles: 'identified_only',
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

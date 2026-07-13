import { supabase } from '../lib/supabase';

/**
 * Read-only PostHog HogQL querying for the admin reconciliation dashboard.
 * Uses a Personal API Key (query:read scope) — distinct from POSTHOG_KEY, which
 * is the write-only ingestion key used by posthog-node for capture().
 *
 * The key is stored in app_settings (key: 'posthog_personal_api_key'), set via
 * the admin UI, same write-only pattern as wallet_pool secrets — never read
 * back out to the frontend once saved. POSTHOG_PERSONAL_API_KEY env var is a
 * fallback for local dev.
 */
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID || '';
const APP_HOST = process.env.POSTHOG_APP_HOST || 'https://us.posthog.com';

export interface PaymentLinkAnalytics {
    configured: boolean;
    loaded: number;
    failed: number;
    errorsByReason: { reason: string; count: number }[];
    /** Set when a key is saved but PostHog rejected it (invalid/wrong scope) — lets the UI re-prompt instead of dead-ending. */
    queryError?: string;
}

async function getPersonalApiKey(): Promise<string> {
    const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'posthog_personal_api_key')
        .maybeSingle();
    return data?.value?.apiKey || process.env.POSTHOG_PERSONAL_API_KEY || '';
}

export async function setPersonalApiKey(apiKey: string): Promise<void> {
    const { error } = await supabase.from('app_settings').upsert({
        key: 'posthog_personal_api_key',
        value: { apiKey },
        updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    if (error) throw error;
}

export async function isPersonalApiKeyConfigured(): Promise<boolean> {
    return !!(await getPersonalApiKey());
}

async function runHogQL(apiKey: string, query: string): Promise<any[]> {
    const res = await fetch(`${APP_HOST}/api/projects/${PROJECT_ID}/query/`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`PostHog query failed (${res.status}): ${detail}`);
    }
    const body: any = await res.json();
    return body.results || [];
}

export interface PaymentLinkAttempt {
    timestamp: string;
    status: 'loaded' | 'failed';
    linkType: string | null;
    durationMs: number | null;
    errorReason: string | null;
}

export interface PaymentLinkAttemptsResult {
    configured: boolean;
    attempts: PaymentLinkAttempt[];
    queryError?: string;
}

export async function getPaymentLinkAttempts(): Promise<PaymentLinkAttemptsResult> {
    const apiKey = await getPersonalApiKey();
    if (!apiKey || !PROJECT_ID) {
        return { configured: false, attempts: [] };
    }

    try {
        const rows = await runHogQL(apiKey, `
            SELECT timestamp, event, properties.link_type, properties.duration_ms, properties.error_type
            FROM events
            WHERE event IN ('payment_link_loaded', 'payment_link_failed')
              AND timestamp > now() - interval 30 day
            ORDER BY timestamp DESC
            LIMIT 200
        `);

        return {
            configured: true,
            attempts: rows.map((row: any[]) => ({
                timestamp: row[0],
                status: row[1] === 'payment_link_failed' ? 'failed' : 'loaded',
                linkType: row[2] ?? null,
                durationMs: row[3] != null ? Number(row[3]) : null,
                errorReason: row[4] ?? null,
            })),
        };
    } catch (err: any) {
        return { configured: true, attempts: [], queryError: err?.message || 'PostHog query failed' };
    }
}

export async function getPaymentLinkAnalytics(): Promise<PaymentLinkAnalytics> {
    const apiKey = await getPersonalApiKey();
    if (!apiKey || !PROJECT_ID) {
        return { configured: false, loaded: 0, failed: 0, errorsByReason: [] };
    }

    try {
        const [counts, reasons] = await Promise.all([
            runHogQL(apiKey, `
                SELECT event, count() AS c
                FROM events
                WHERE event IN ('payment_link_loaded', 'payment_link_failed')
                  AND timestamp > now() - interval 30 day
                GROUP BY event
            `),
            runHogQL(apiKey, `
                SELECT properties.error_type AS reason, count() AS c
                FROM events
                WHERE event = 'payment_link_failed'
                  AND timestamp > now() - interval 30 day
                GROUP BY reason
                ORDER BY c DESC
            `),
        ]);

        const countsByEvent = Object.fromEntries(counts.map((row: any[]) => [row[0], row[1]]));

        return {
            configured: true,
            loaded: countsByEvent['payment_link_loaded'] || 0,
            failed: countsByEvent['payment_link_failed'] || 0,
            errorsByReason: reasons.map((row: any[]) => ({ reason: row[0] || 'Unknown', count: row[1] })),
        };
    } catch (err: any) {
        // A saved-but-bad key (invalid, revoked, wrong scope) must not read as
        // "not configured" — the UI needs to know a key exists so it can offer
        // to replace it, rather than silently falling back to the setup prompt.
        return { configured: true, loaded: 0, failed: 0, errorsByReason: [], queryError: err?.message || 'PostHog query failed' };
    }
}

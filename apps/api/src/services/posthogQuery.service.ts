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

export interface TrackingHealthRow {
    event: string;
    platform: string;
    last24h: number;
    prior6d: number;
}

export interface TrackingHealth {
    configured: boolean;
    rows: TrackingHealthRow[];
    queryError?: string;
}

/**
 * Event counts for the analytics added in Nov 2026 (usage, sessions, money flows): the last 24 hours against the six days
 * before, by platform. Used by the daily tracking-health check to spot an app or the API that has stopped reporting.
 */
export async function trackingHealth(): Promise<TrackingHealth> {
    const apiKey = await getPersonalApiKey();
    if (!apiKey || !PROJECT_ID) return { configured: false, rows: [] };
    try {
        const results = await runHogQL(
            apiKey,
            `SELECT event, ifNull(toString(properties.platform), 'n/a') AS platform,
                    countIf(timestamp > now() - INTERVAL 1 DAY) AS last_24h,
                    countIf(timestamp <= now() - INTERVAL 1 DAY) AS prior_6d
             FROM events
             WHERE timestamp > now() - INTERVAL 7 DAY
               AND event IN ('app_opened', 'app_backgrounded', 'feature_used', 'money_flow_started', 'money_flow_completed', 'money_flow_failed')
             GROUP BY event, platform`
        );
        return {
            configured: true,
            rows: results.map((r: any[]) => ({ event: String(r[0]), platform: String(r[1]), last24h: Number(r[2]) || 0, prior6d: Number(r[3]) || 0 })),
        };
    } catch (e: any) {
        return { configured: true, rows: [], queryError: String(e?.message || e).slice(0, 300) };
    }
}

export interface TrackingProblem { severity: 'broken' | 'watch'; message: string }

/** Pure: turns the counts into plain-language problems. Empty list = healthy. */
export function assessTrackingHealth(h: TrackingHealth): TrackingProblem[] {
    if (!h.configured) return [{ severity: 'broken', message: 'No PostHog personal API key is saved (Admin → Analytics), so tracking cannot be checked.' }];
    if (h.queryError) return [{ severity: 'broken', message: `PostHog rejected the check query: ${h.queryError}` }];

    const sum = (event: string, platform?: string, field: 'last24h' | 'prior6d' = 'last24h') =>
        h.rows.filter(r => r.event === event && (!platform || r.platform === platform)).reduce((a, r) => a + r[field], 0);
    const problems: TrackingProblem[] = [];

    // Each client should keep opening: silence now after activity before is a break; silence in both is "never arrived".
    for (const p of ['ios', 'android', 'web']) {
        const now = sum('app_opened', p), before = sum('app_opened', p, 'prior6d');
        if (now === 0 && before > 0) problems.push({ severity: 'broken', message: `${p}: no app_opened in the last 24h, but ${before} in the six days before. Tracking may have stopped.` });
        else if (now === 0 && before === 0) problems.push({ severity: 'watch', message: `${p}: no app_opened events in the last 7 days. Never reported (not updated yet, or no users).` });
        else if (sum('app_backgrounded', p) === 0) problems.push({ severity: 'watch', message: `${p}: app opens arrive but no app_backgrounded, so time-in-app is not being measured.` });
    }
    if (sum('feature_used') === 0) problems.push({ severity: 'broken', message: 'The API sent no feature_used events in the last 24h.' });

    const started = sum('money_flow_started'), done = sum('money_flow_completed'), failed = sum('money_flow_failed');
    if (started > 0 && done === 0) problems.push({ severity: 'broken', message: `Money flows: ${started} started, none completed in 24h. Completion tracking may be broken (or payments are failing).` });
    if (started >= 10 && failed / started > 0.3) problems.push({ severity: 'watch', message: `Money flows: ${failed} of ${started} attempts failed in 24h (${Math.round((failed / started) * 100)}%).` });
    return problems;
}

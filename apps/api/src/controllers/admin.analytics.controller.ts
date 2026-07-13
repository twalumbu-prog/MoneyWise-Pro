import { getPaymentLinkAnalytics, getPaymentLinkAttempts, setPersonalApiKey } from '../services/posthogQuery.service';

/**
 * GET /admin/analytics/payment-links
 * Load success/failure counts + error breakdown for public payment links,
 * sourced directly from PostHog (works around the flaky shared-dashboard view).
 */
export const getPaymentLinkAnalyticsHandler = async (_req: any, res: any) => {
    try {
        const data = await getPaymentLinkAnalytics();
        res.json(data);
    } catch (err: any) {
        console.error('[AdminAnalytics] payment-link analytics failed:', err?.message || err);
        res.status(500).json({ error: 'Failed to load payment link analytics', details: err?.message });
    }
};

/**
 * GET /admin/analytics/payment-links/attempts
 * Individual load attempts (up to 200, last 30 days) backing the two charts —
 * timestamp, status, link type, load duration, and error reason where relevant.
 */
export const getPaymentLinkAttemptsHandler = async (_req: any, res: any) => {
    try {
        const data = await getPaymentLinkAttempts();
        res.json(data);
    } catch (err: any) {
        console.error('[AdminAnalytics] payment-link attempts failed:', err?.message || err);
        res.status(500).json({ error: 'Failed to load payment link attempts', details: err?.message });
    }
};

/**
 * PUT /admin/analytics/posthog-key
 * Write-only: stores the PostHog Personal API Key used to read data back out.
 * Never echoed back — same pattern as wallet_pool secrets.
 */
export const setPostHogKeyHandler = async (req: any, res: any) => {
    try {
        const apiKey = String(req.body?.apiKey || '').trim();
        if (!apiKey) {
            return res.status(400).json({ error: 'apiKey is required' });
        }
        await setPersonalApiKey(apiKey);
        res.json({ message: 'PostHog API key saved' });
    } catch (err: any) {
        console.error('[AdminAnalytics] saving PostHog key failed:', err?.message || err);
        res.status(500).json({ error: 'Failed to save PostHog API key', details: err?.message });
    }
};

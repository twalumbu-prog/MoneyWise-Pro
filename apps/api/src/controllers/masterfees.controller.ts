import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import {
    MasterFeesClient,
    getMasterFeesIntegration,
    detectLencoMode,
    syncMasterfees,
    syncMasterfeesPayments,
    recategorizeMasterfeesInvoices,
    applyPaymentDateCorrections,
    reconcileMasterfees,
    MasterFeesConfig,
} from '../services/masterfees.service';

// ── OAuth helpers ─────────────────────────────────────────────────────────────

/** Returns the public base URL of this API (used to build the OAuth callback URL).
 *
 * IMPORTANT: this must be the DIRECT API URL, not the web-app proxy path
 * (/api/*).  The web project's service worker intercepts navigation to its own
 * domain and returns the cached SPA shell for any unrecognised path — including
 * /api/integrations/masterfees/oauth/callback — so the callback never reaches
 * the network.  Pointing to money-wise-pro-api.vercel.app bypasses both the
 * proxy rewrite and the service worker entirely.
 */
function getApiBaseUrl(): string {
    if (process.env.API_BASE_URL) return process.env.API_BASE_URL.replace(/\/$/, '');
    if (process.env.NODE_ENV === 'production') return 'https://money-wise-pro-api.vercel.app';
    return 'http://localhost:3000';
}

function getFrontendUrl(): string {
    if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, '');
    if (process.env.NODE_ENV === 'production') return 'https://moneywise.blueopus.cloud';
    return 'http://localhost:5173';
}

/**
 * Respond with HTML that performs a client-side redirect to `url`.
 *
 * We cannot use res.redirect() here because the web app's Vercel config
 * rewrites /api/* to the API via a transparent server-side proxy.  When the
 * API sends a 302, Vercel's proxy follows it server-side, fetches the SPA's
 * index.html, and returns that to the browser with the original callback URL
 * still in the address bar — so React Router sees the /api/... path and
 * renders nothing.  A JS-based redirect in the HTML body bypasses this: the
 * proxy passes the HTML through as-is, and the browser's JS navigates to the
 * correct settings URL.
 */
function jsRedirect(res: Response, url: string) {
    const safe = url.replace(/'/g, '%27').replace(/"/g, '%22');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Visible fallback link in case JS is blocked — also shows the user something
    // while we diagnose. Remove once the flow is confirmed working.
    res.send(
        `<!DOCTYPE html><html><head><meta charset="utf-8">` +
        `<meta http-equiv="refresh" content="0;url=${safe}">` +
        `<style>body{font-family:sans-serif;padding:40px;max-width:600px;margin:auto}` +
        `a{color:#1a6ef7;word-break:break-all}</style>` +
        `</head><body>` +
        `<script>try{window.location.replace("${safe}");}catch(e){document.getElementById('err').textContent=e.message;}</script>` +
        `<p><strong>Completing Master Fees connection…</strong></p>` +
        `<p>You should be redirected automatically. If not, <a href="${safe}">click here</a>.</p>` +
        `<p id="err" style="color:red"></p>` +
        `</body></html>`,
    );
}

const PROVIDER = 'MASTERFEES';
const MF_OAUTH_BASE = 'https://dashboard.master-fees.com/oauth/consent';

/**
 * TEMPORARY diagnostic — GET /integrations/masterfees/diag
 * Reports this serverless function's egress IP and the RAW Master Fees response
 * (status, content-type, body snippet) so we can tell an IP/WAF block (HTML page)
 * apart from an app-level resource guard (JSON message). Remove once resolved.
 */
export const masterFeesDiag = async (req: AuthRequest, res: Response) => {
    const axios = require('axios');
    const out: any = { region: process.env.VERCEL_REGION || process.env.AWS_REGION || 'unknown' };

    // 1. What egress IP does this function present to the outside world?
    for (const svc of ['https://api.ipify.org?format=json', 'https://ifconfig.me/all.json']) {
        try {
            const r = await axios.get(svc, { timeout: 8000 });
            out.egress = r.data;
            out.egressSource = svc;
            break;
        } catch (e: any) { out.egressError = e.message; }
    }

    // 2. Raw Master Fees call from this function.
    const integration = await getMasterFeesIntegration(req.user.organization_id);
    if (!integration) { out.mf = 'not connected'; return res.json(out); }
    const { schoolId, publicKey } = integration.config;
    const url = `https://dashboard.master-fees.com/api/v1/school/${schoolId}/data/fee-categories`;
    out.mfUrl = url;
    out.keyPrefix = String(publicKey || '').slice(0, 12);
    try {
        const r = await axios.get(url, {
            headers: { 'X-MF-Public-Key': publicKey, 'Content-Type': 'application/json' },
            timeout: 20000,
            validateStatus: () => true, // capture any status, don't throw
        });
        out.mf = {
            status: r.status,
            contentType: r.headers['content-type'],
            server: r.headers['server'],
            cfRay: r.headers['cf-ray'],
            bodySnippet: (typeof r.data === 'string' ? r.data : JSON.stringify(r.data)).slice(0, 600),
        };
    } catch (e: any) {
        out.mf = { error: e.message, code: e.code };
    }
    res.json(out);
};

// ── OAuth flow ────────────────────────────────────────────────────────────────

/**
 * GET /integrations/masterfees/oauth/url
 * Returns the Master Fees consent URL to redirect the user to for 1-click OAuth setup.
 * Embeds `state=org:<orgId>` so the callback can identify which org is connecting.
 */
export const getMasterFeesOAuthUrl = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const callbackUrl = `${getApiBaseUrl()}/integrations/masterfees/oauth/callback`;
        const state = `org:${organizationId}`;
        const url = `${MF_OAUTH_BASE}?client_id=moneywise&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(state)}`;
        res.json({ url });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /integrations/masterfees/oauth/callback
 * No auth — called by Master Fees after the user authorizes the connection.
 * Receives: ?status=success&school_id=UUID&public_key=mf_pub_...&state=org:<orgId>
 * Stores credentials and kicks an initial sync, then redirects to the frontend.
 */
export const masterFeesOAuthCallback = async (req: Request, res: Response) => {
    console.log('[MF OAuth] callback hit — method:', req.method, 'path:', req.path, 'query keys:', Object.keys(req.query));

    // Master Fees sends: ?status=success&school_id=UUID&school_name=...&public_key=mf_pub_...&state=org:<orgId>
    const { status, school_id, school_name, public_key, state } = req.query;
    const frontendUrl = getFrontendUrl();
    const settingsBase = `${frontendUrl}/settings?tab=integrations`;

    console.log('[MF OAuth] status=%s school_id=%s school_name=%s state=%s frontendUrl=%s',
        status, school_id, school_name, state, frontendUrl);

    if (status !== 'success' || !school_id || !public_key) {
        console.log('[MF OAuth] early exit: missing required params');
        const msg = encodeURIComponent('Master Fees authorization was cancelled or did not complete.');
        return jsRedirect(res, `${settingsBase}&mf_status=error&mf_message=${msg}`);
    }

    // Validate state — "org:<orgId>"
    const [prefix, organizationId] = String(state || '').split(':');
    console.log('[MF OAuth] state split — prefix=%s orgId=%s', prefix, organizationId);
    if (prefix !== 'org' || !organizationId) {
        console.log('[MF OAuth] invalid state');
        const msg = encodeURIComponent('Invalid OAuth state — please try connecting again.');
        return jsRedirect(res, `${settingsBase}&mf_status=error&mf_message=${msg}`);
    }

    try {
        const config: MasterFeesConfig = {
            schoolId: String(school_id).trim(),
            publicKey: String(public_key).trim(),
            schoolName: school_name ? String(school_name).trim() : String(school_id).trim(),
            lencoMode: 'separate',
            lencoModeOverridden: false,
        };
        console.log('[MF OAuth] config built — schoolId=%s schoolName=%s', config.schoolId, config.schoolName);

        const existing = await getMasterFeesIntegration(organizationId);
        console.log('[MF OAuth] existing integration:', existing ? 'found' : 'none');

        const merged = existing ? { ...existing.config, ...config } : config;
        const { error } = await supabase
            .from('integrations')
            .upsert(
                { provider: PROVIDER, organization_id: organizationId, config: merged, updated_at: new Date().toISOString() },
                { onConflict: 'organization_id,provider' },
            );
        if (error) {
            console.error('[MF OAuth] supabase upsert error:', error);
            throw error;
        }
        console.log('[MF OAuth] upsert OK — firing background sync and redirecting to success');

        syncMasterfees(organizationId).catch(err =>
            console.error('[MasterFees OAuth] initial sync failed:', err.message),
        );

        return jsRedirect(res, `${settingsBase}&mf_status=success`);
    } catch (err: any) {
        console.error('[MF OAuth] caught error:', err.message, err.stack);
        const msg = encodeURIComponent(err.message || 'Failed to complete Master Fees connection');
        return jsRedirect(res, `${settingsBase}&mf_status=error&mf_message=${msg}`);
    }
};

// ── Manual connect (kept as fallback) ────────────────────────────────────────

/** Connect (or re-connect) a Master Fees school to this organization. */
export const connectMasterFees = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const { schoolId, publicKey, baseUrl } = req.body || {};
        if (!schoolId || !publicKey) {
            return res.status(400).json({ error: 'schoolId and publicKey are required.' });
        }

        const config: MasterFeesConfig = { schoolId: String(schoolId).trim(), publicKey: String(publicKey).trim(), baseUrl: baseUrl?.trim() || undefined };
        const client = new MasterFeesClient(config);

        // Validate credentials by hitting the API (also surfaces a disabled master switch).
        const ping = await client.ping();
        config.schoolName = ping.school_name;

        // Auto-detect whether Master Fees shares this org's Lenco account.
        config.lencoMode = await detectLencoMode(organizationId, client);
        config.lencoModeOverridden = false;

        // Upsert the integration row (one per org+provider).
        const existing = await getMasterFeesIntegration(organizationId);
        const merged = existing ? { ...existing.config, ...config } : config;
        const { error } = await supabase
            .from('integrations')
            .upsert({
                provider: PROVIDER,
                organization_id: organizationId,
                config: merged,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'organization_id,provider' });
        if (error) throw error;

        // Kick an initial sync (non-blocking so connect returns fast).
        syncMasterfees(organizationId).catch(err => console.error('[MasterFees] initial sync failed:', err.message));

        res.json({ connected: true, schoolName: config.schoolName, lencoMode: config.lencoMode, categories: ping.categories?.length || 0 });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const getMasterFeesStatus = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const integration = await getMasterFeesIntegration(organizationId);
        if (!integration) return res.json({ connected: false });
        const { publicKey, ...safe } = integration.config; // never leak the key back
        res.json({
            connected: true,
            schoolId: safe.schoolId,
            schoolName: safe.schoolName,
            lencoMode: safe.lencoMode,
            lencoModeOverridden: safe.lencoModeOverridden,
            categoryMap: safe.categoryMap || {},
            lastSyncedAt: safe.lastSyncedAt,
            lastSyncError: safe.lastSyncError,
            lastSyncTruncated: !!safe.lastSyncTruncated,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const disconnectMasterFees = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const { error } = await supabase
            .from('integrations')
            .delete()
            .eq('provider', PROVIDER)
            .eq('organization_id', organizationId);
        if (error) throw error;
        // Journals + provisioned accounts are intentionally left in place so historical
        // reports stay intact; reconnecting resumes idempotently.
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** List the Master Fees fee categories with their current income-account mapping. */
export const getMasterFeesFeeCategories = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const integration = await getMasterFeesIntegration(organizationId);
        if (!integration) return res.status(404).json({ error: 'Master Fees is not connected.' });
        const client = new MasterFeesClient(integration.config);
        const categories = await client.getFeeCategories();
        const map = integration.config.categoryMap || {};
        res.json(categories.map((c: any) => {
            const id = c.id || c.category_id || c.fee_category_id;
            return { id, name: c.name, amount: c.amount ?? c.price ?? null, accountId: id ? map[id]?.accountId || null : null };
        }));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** Override the income account a fee category posts to. */
export const updateMasterFeesCategoryMapping = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const { categoryId, accountId, name } = req.body || {};
        if (!categoryId || !accountId) return res.status(400).json({ error: 'categoryId and accountId are required.' });

        const integration = await getMasterFeesIntegration(organizationId);
        if (!integration) return res.status(404).json({ error: 'Master Fees is not connected.' });

        const map = { ...(integration.config.categoryMap || {}) };
        map[categoryId] = { accountId, name: name || map[categoryId]?.name || categoryId };
        const { error } = await supabase
            .from('integrations')
            .update({ config: { ...integration.config, categoryMap: map }, updated_at: new Date().toISOString() })
            .eq('provider', PROVIDER)
            .eq('organization_id', organizationId);
        if (error) throw error;
        res.json({ success: true, categoryMap: map });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** Manually override the auto-detected shared/separate Lenco mode. */
export const updateMasterFeesLencoMode = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const { lencoMode } = req.body || {};
        if (!['shared', 'separate'].includes(lencoMode)) {
            return res.status(400).json({ error: "lencoMode must be 'shared' or 'separate'." });
        }
        const integration = await getMasterFeesIntegration(organizationId);
        if (!integration) return res.status(404).json({ error: 'Master Fees is not connected.' });
        const { error } = await supabase
            .from('integrations')
            .update({ config: { ...integration.config, lencoMode, lencoModeOverridden: true }, updated_at: new Date().toISOString() })
            .eq('provider', PROVIDER)
            .eq('organization_id', organizationId);
        if (error) throw error;
        res.json({ success: true, lencoMode });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** Manual "Sync now". */
export const syncMasterFeesNow = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const summary = await syncMasterfees(organizationId);
        res.json({ success: true, summary });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getMasterFeesReconciliation = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = req.user.organization_id;
        const result = await reconcileMasterfees(organizationId);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * One-off ops endpoint: close a single org's PAYMENT backlog directly, skipping
 * the invoice phase and posting only transactions never seen before.
 *
 * Exists because the normal path (syncMasterfees, via syncAllMasterFees below)
 * walks invoices before payments every pass. On an org with a large, mostly-synced
 * invoice backlog, re-walking thousands of already-skipped invoices burns the
 * whole per-call budget before the payments loop ever runs — confirmed on
 * Twalumbu, which sat at 1,546/3,095 payments synced while invoices were 95%
 * done. Call this repeatedly (each call is bounded well under Vercel's 45s
 * function limit) until `payments.posted + reclassified` comes back 0 with no
 * "Time budget reached" error — see [[masterfees-integration]] memory.
 *
 * Same secret + same idempotent posting path as the real sync — this only
 * changes *what order* work happens in, not the accounting logic.
 */
export const backfillMasterFeesPayments = async (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    const syncSecret = process.env.MASTERFEES_SYNC_SECRET || process.env.LENCO_SYNC_SECRET;
    if (syncSecret && authHeader !== `Bearer ${syncSecret}`) {
        return res.status(401).json({ error: 'Unauthorized: Invalid sync secret' });
    }
    const organizationId = String(req.query.organizationId || req.body?.organizationId || '');
    if (!organizationId) return res.status(400).json({ error: 'organizationId is required' });

    try {
        const summary = await syncMasterfeesPayments(organizationId, Date.now() + 35_000, { onlyMissing: true });
        res.json({ success: true, summary });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * One-off ops endpoint: rebuild every posted invoice's journal against the
 * fixed category-resolution logic (resolveItemCategory now reads MF's own
 * item.category tag instead of guessing from free text). Call repeatedly
 * (each call bounded well under Vercel's 45s limit) until invoices.posted
 * comes back 0 with no "Time budget reached" error.
 */
export const recategorizeMasterFeesInvoices = async (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    const syncSecret = process.env.MASTERFEES_SYNC_SECRET || process.env.LENCO_SYNC_SECRET;
    if (syncSecret && authHeader !== `Bearer ${syncSecret}`) {
        return res.status(401).json({ error: 'Unauthorized: Invalid sync secret' });
    }
    const organizationId = String(req.query.organizationId || req.body?.organizationId || '');
    if (!organizationId) return res.status(400).json({ error: 'organizationId is required' });
    const sinceCutoff = String(req.query.sinceCutoff || req.body?.sinceCutoff || '') || undefined;

    try {
        const summary = await recategorizeMasterfeesInvoices(organizationId, Date.now() + 35_000, { sinceCutoff });
        res.json({ success: true, summary });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * One-off ops endpoint: correct payment dates from a bank reconciliation.
 * Master Fees' completed_at is a known-unreliable bulk-import artifact, so
 * every cashbook_entries.date for a synced payment inherited that wrong date.
 * A bank reconciliation gives the real date for whatever it confirms — this
 * applies those corrections (journal re-derivation + running-balance recalc
 * included, see applyPaymentDateCorrections). Same secret gate as the other
 * ops endpoints above.
 */
export const correctMasterFeesPaymentDates = async (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    const syncSecret = process.env.MASTERFEES_SYNC_SECRET || process.env.LENCO_SYNC_SECRET;
    if (syncSecret && authHeader !== `Bearer ${syncSecret}`) {
        return res.status(401).json({ error: 'Unauthorized: Invalid sync secret' });
    }
    const organizationId = String(req.body?.organizationId || '');
    const corrections = req.body?.corrections;
    if (!organizationId) return res.status(400).json({ error: 'organizationId is required' });
    if (!Array.isArray(corrections) || corrections.length === 0) {
        return res.status(400).json({ error: 'corrections must be a non-empty array of { cashbookEntryId, date }' });
    }
    for (const c of corrections) {
        if (!c?.cashbookEntryId || !c?.date) {
            return res.status(400).json({ error: 'Each correction needs cashbookEntryId and date' });
        }
    }

    try {
        const summary = await applyPaymentDateCorrections(organizationId, corrections, Date.now() + 35_000);
        res.json({ success: true, summary });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Cron entry point: sync every organization that has a Master Fees integration.
 * Secured by MASTERFEES_SYNC_SECRET (falls back to LENCO_SYNC_SECRET for reuse of
 * the existing scheduling pipeline). Bounded by a time budget like the Lenco sync.
 */
export const syncAllMasterFees = async (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    const syncSecret = process.env.MASTERFEES_SYNC_SECRET || process.env.LENCO_SYNC_SECRET;
    if (syncSecret && authHeader !== `Bearer ${syncSecret}`) {
        return res.status(401).json({ error: 'Unauthorized: Invalid sync secret' });
    }

    const START = Date.now();
    // Vercel's function maxDuration is 45s (vercel.json). Leave headroom for the
    // request/response overhead and stop starting new orgs — and stop a single
    // org's own work — well before that hard cutoff. Each org's syncMasterfees
    // call gets a per-org deadline derived from the remaining global budget, so
    // one large org (many invoices needing real posting) can't consume the
    // entire request and starve — or blow past the timeout ahead of — the rest.
    const GLOBAL_BUDGET_MS = 38_000;
    try {
        // Oldest-synced-first (never-synced orgs first via nullsFirst). Without this,
        // the query has no stable ordering guarantee and whichever org happens to
        // come back first can perpetually consume the whole per-request budget,
        // starving every other org indefinitely — confirmed live, 2026-08-18: one
        // org's sync ran to completion of its own internal deadline every single
        // tick while a different (larger) org never got a turn at all across many
        // consecutive minutes. Prioritizing the org that's gone longest without a
        // successful sync makes progress fair across ticks even when no single org
        // fits in one request's budget.
        const { data: rows, error } = await supabase
            .from('integrations')
            .select('organization_id')
            .eq('provider', PROVIDER)
            .not('organization_id', 'is', null)
            .order('config->>lastSyncedAt', { ascending: true, nullsFirst: true });
        if (error) throw error;

        const results: any[] = [];
        for (const row of rows || []) {
            const elapsed = Date.now() - START;
            if (elapsed > GLOBAL_BUDGET_MS) {
                console.warn(`[MasterFees Sync] Time budget exceeded — deferring ${(rows!.length) - results.length} org(s).`);
                break;
            }
            try {
                const perOrgDeadline = START + GLOBAL_BUDGET_MS;
                // Payments-only, missing-only. The routine cron used to run the
                // FULL sync (walk every invoice, then re-examine every already-
                // recorded payment's self-heal state) every single minute forever
                // — expensive against Master Fees' API and against our own DB for
                // essentially no benefit once an org's backlog is caught up.
                // syncMasterfeesPayments({ onlyMissing: true }) only processes
                // transactions we've never recorded, which is what a routine tick
                // actually needs. A full walk (invoices + full self-heal, e.g. to
                // catch an amount edited after the fact) is still available on
                // demand via the "Sync Now" button (syncMasterFeesNow ->
                // syncMasterfees, unchanged) — this only lightens the automatic
                // per-minute tick.
                const summary = await syncMasterfeesPayments(row.organization_id, perOrgDeadline, { onlyMissing: true });
                results.push({ organizationId: row.organization_id, success: true, summary });
            } catch (err: any) {
                results.push({ organizationId: row.organization_id, success: false, error: err.message });
            }
        }
        res.json({ success: true, processed: results.length, results });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

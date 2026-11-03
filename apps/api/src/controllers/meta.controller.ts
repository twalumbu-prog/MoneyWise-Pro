import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import {
    isMetaConfigured, verifySignature, parseWebhook, ingestMessages, graphVersion,
} from '../services/meta.service';
import { classifyMessage } from '../services/messageIntent.service';

/** GET /integrations/meta/status — connections for the caller's org + whether the platform is configured server-side. */
export const getMetaStatus = async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'User does not belong to an organization' });
    const { data, error } = await supabase.from('messaging_connections')
        .select('id, platform, display_name, display_phone, status, last_error, last_message_at, created_at')
        .eq('organization_id', organizationId).neq('status', 'DISCONNECTED');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ configured: isMetaConfigured(), connections: data || [] });
};

/**
 * GET /integrations/meta/connect/:platform — STUB. Will return the Meta dialog URL (Facebook Login for Business for
 * FACEBOOK/INSTAGRAM, Embedded Signup for WHATSAPP). Needs the approved Meta app + App Review; until then it answers
 * 503 so the web card shows "not configured yet".
 */
export const getMetaConnectUrl = async (req: Request, res: Response) => {
    if (!isMetaConfigured()) return res.status(503).json({ error: 'Meta integration is not configured yet', configured: false });
    const platform = String(req.params.platform || '').toUpperCase();
    if (!['WHATSAPP', 'FACEBOOK', 'INSTAGRAM'].includes(platform)) return res.status(400).json({ error: 'Unknown platform' });
    // TODO(meta-app-approved): build https://www.facebook.com/{graphVersion}/dialog/oauth?client_id&redirect_uri&state(signed org+user)&config_id
    return res.status(501).json({ error: `Connect flow for ${platform} not implemented yet (Graph ${graphVersion()})` });
};

/** GET /integrations/meta/callback — STUB. Will exchange ?code for a long-lived token, list Pages/WABAs, subscribe webhooks, saveConnection(). */
export const metaOAuthCallback = async (_req: Request, res: Response) => {
    // TODO(meta-app-approved): verify signed state, code→token exchange, GET /me/accounts, POST /{page}/subscribed_apps,
    // POST /{waba}/subscribed_apps, then saveConnection() and redirect to Settings → Integrations.
    res.status(501).send('Meta connect callback not implemented yet');
};

export const disconnectMeta = async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization_id;
    const { error } = await supabase.from('messaging_connections')
        .update({ status: 'DISCONNECTED', access_token_enc: null, updated_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('organization_id', organizationId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
};

/** GET /integrations/meta/webhook — Meta's subscription handshake. */
export const verifyMetaWebhook = (req: Request, res: Response) => {
    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (expected && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === expected) {
        return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
    }
    res.sendStatus(403);
};

/**
 * POST /integrations/meta/webhook — signature-verified against the raw body (req.rawBody from the global
 * express.json verify hook), ingested, then classified. Always 200s a valid signature quickly so Meta doesn't retry.
 */
export const receiveMetaWebhook = async (req: Request, res: Response) => {
    if (!verifySignature((req as any).rawBody, req.header('x-hub-signature-256'))) return res.sendStatus(401);
    try {
        const inserted = await ingestMessages(parseWebhook(req.body));
        // Classification awaited (small payloads) so serverless doesn't freeze it after the response.
        await Promise.all(inserted.map(m => classifyMessage(m.id, m.organization_id)));
    } catch (e: any) {
        console.error('[Meta] webhook handling failed:', e?.message);
    }
    res.sendStatus(200);
};

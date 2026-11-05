import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { decryptToken } from '../lib/tokenCrypto';
import {
    isMetaConfigured, verifySignature, parseWebhook, ingestMessages, graphVersion, saveConnection,
    signConnectState, verifyConnectState, connectWhatsApp, unsubscribeApp, parseSignedRequest, MetaGraphError,
} from '../services/meta.service';
import { deleteMetaUserData, deletionStatus } from '../services/meta.deletion';
import { isCapturePlanEligible } from '../services/capture/capture.settings';

const RECONNECT_WINDOW_MS = 7 * 86400_000;
const PLAN_MESSAGE = 'Connecting messaging needs an active Premium plan. Manage your plan under Settings → Subscription & Billing.';

async function audit(orgId: string, userId: string, connectionId: string, action: string, changes: Record<string, any> = {}) {
    await supabase.from('audit_logs').insert({
        entity_type: 'MESSAGING_CONNECTION', entity_id: connectionId, action, user_id: userId, changes: { organization_id: orgId, ...changes },
    }).then(() => undefined, () => undefined);
}

/** GET /integrations/meta/status — connections for the caller's org + whether the platform is configured server-side. */
export const getMetaStatus = async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'User does not belong to an organization' });
    const { data, error } = await supabase.from('messaging_connections')
        .select('id, platform, display_name, display_phone, status, last_error, last_message_at, created_at, token_expires_at')
        .eq('organization_id', organizationId).neq('status', 'DISCONNECTED');
    if (error) return res.status(500).json({ error: 'Could not load connections' });
    const connections = (data || []).map((c: any) => ({
        ...c,
        needs_reconnect: c.status === 'EXPIRED' || (!!c.token_expires_at && new Date(c.token_expires_at).getTime() - Date.now() < RECONNECT_WINDOW_MS),
    }));
    res.json({ configured: isMetaConfigured(), connections });
};

/** GET /integrations/meta/connect/:platform — what the Connect button needs to open Meta's sign-up. Facebook and Instagram arrive in Phase 2. */
export const getMetaConnectUrl = async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!isMetaConfigured() || !process.env.META_WA_CONFIG_ID) return res.status(503).json({ error: 'Meta integration is not configured yet', configured: false });
    if (!(await isCapturePlanEligible(user.organization_id))) return res.status(402).json({ error: PLAN_MESSAGE, code: 'PLAN_LIMIT' });
    if (String(req.params.platform || '').toUpperCase() !== 'WHATSAPP') return res.status(501).json({ error: 'Facebook and Instagram are coming soon' });
    res.json({
        appId: process.env.META_APP_ID, configId: process.env.META_WA_CONFIG_ID, graphVersion: graphVersion(),
        state: signConnectState({ organizationId: user.organization_id, userId: user.id }),
    });
};

/**
 * POST /integrations/meta/callback — finishes WhatsApp sign-up. The org comes from the session and must match the
 * signed state. Every check and Meta call runs before saveConnection, so a failure leaves no half-saved row.
 */
export const metaOAuthCallback = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { code, state, wabaId, phoneNumberId } = req.body ?? {};
    const signed = verifyConnectState(state);
    if (!signed || signed.organizationId !== user.organization_id || signed.userId !== user.id) {
        return res.status(400).json({ error: 'This connection attempt expired. Please try again.' });
    }
    if (typeof code !== 'string' || typeof wabaId !== 'string' || typeof phoneNumberId !== 'string') {
        return res.status(400).json({ error: 'Sign-up did not finish. Pick your WhatsApp number, then try again.' });
    }
    if (!(await isCapturePlanEligible(user.organization_id))) return res.status(402).json({ error: PLAN_MESSAGE, code: 'PLAN_LIMIT' });

    const { data: taken } = await supabase.from('messaging_connections').select('organization_id, status')
        .eq('platform', 'WHATSAPP').eq('external_id', phoneNumberId).maybeSingle();
    if (taken && taken.organization_id !== user.organization_id && taken.status !== 'DISCONNECTED') {
        return res.status(409).json({ error: 'This WhatsApp number is connected to another MoneyWise business. Ask them to disconnect it, or contact MoneyWise support.' });
    }

    try {
        const c = await connectWhatsApp({ code, wabaId, phoneNumberId });
        const { data, error } = await saveConnection({
            organizationId: user.organization_id, userId: user.id, platform: 'WHATSAPP', externalId: phoneNumberId, parentExternalId: wabaId,
            displayName: c.displayName, displayPhone: c.displayPhone, accessToken: c.accessToken, expiresAt: c.expiresAt,
        });
        if (error || !data) throw new Error('Could not save the connection');
        await audit(user.organization_id, user.id, data.id, 'MESSAGING_CONNECTED', { platform: 'WHATSAPP', display_phone: c.displayPhone });
        res.json({ success: true, id: data.id, displayName: c.displayName, displayPhone: c.displayPhone });
    } catch (e: any) {
        console.error('[Meta] connect failed:', e?.message);
        if (e instanceof MetaGraphError) return res.status(400).json({ error: e.friendly });
        res.status(500).json({ error: 'Could not finish connecting WhatsApp. Please try again.' });
    }
};

/** DELETE /integrations/meta/connections/:id — stops delivery at Meta and locally. Captures and ledger entries stay. */
export const disconnectMeta = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { data: conn } = await supabase.from('messaging_connections').select('id, platform, external_id, parent_external_id, access_token_enc')
        .eq('id', req.params.id).eq('organization_id', user.organization_id).maybeSingle();
    if (!conn) return res.status(404).json({ error: 'Connection not found' });

    // Ingestion ignores DISCONNECTED rows, so messages stop even if Meta can't be reached right now.
    let revoked = false;
    if (conn.access_token_enc) {
        try { await unsubscribeApp(conn.parent_external_id || conn.external_id, decryptToken(conn.access_token_enc)); revoked = true; }
        catch (e: any) { console.error('[Meta] revoke failed:', e?.message); }
    }
    const { error } = await supabase.from('messaging_connections')
        .update({ status: 'DISCONNECTED', access_token_enc: null, last_error: revoked ? null : 'Could not reach Meta to revoke access', updated_at: new Date().toISOString() })
        .eq('id', conn.id).eq('organization_id', user.organization_id);
    if (error) return res.status(500).json({ error: 'Could not disconnect' });
    await audit(user.organization_id, user.id, conn.id, 'MESSAGING_DISCONNECTED', { platform: conn.platform, revoked });
    res.json({ success: true, revoked });
};

/** POST /integrations/meta/data-deletion — Meta's signed callback. Replies with a status URL and confirmation code. */
export const metaDataDeletion = async (req: Request, res: Response) => {
    const parsed = parseSignedRequest(req.body?.signed_request);
    if (!parsed) return res.status(400).json({ error: 'Invalid signed request' });
    try {
        const code = await deleteMetaUserData(parsed.userId);
        const base = process.env.API_PUBLIC_URL || 'https://money-wise-pro-api.vercel.app';
        res.json({ url: `${base}/integrations/meta/data-deletion/${code}`, confirmation_code: code });
    } catch (e: any) {
        console.error('[Meta] data deletion failed:', e?.message);
        res.status(500).json({ error: 'Deletion failed' });
    }
};

/** GET /integrations/meta/data-deletion/:code — the public status page Meta links people to. */
export const metaDataDeletionStatus = async (req: Request, res: Response) => {
    const status = await deletionStatus(String(req.params.code || ''));
    if (!status) return res.status(404).send('Deletion request not found');
    const text = status === 'COMPLETE' ? 'Your data has been deleted.' : status === 'FAILED' ? 'Deletion failed. Please contact MoneyWise support.' : 'Your deletion request is in progress.';
    res.type('html').send(`<!doctype html><meta charset="utf-8"><title>MoneyWise data deletion</title><body style="font-family:sans-serif;padding:32px"><h1>Data deletion</h1><p>${text}</p></body>`);
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
 * POST /integrations/meta/webhook
 *
 * Verifies Meta's signature, stores incoming messages and queues
 * their processing. AI classification is handled by a background worker.
 */
export const receiveMetaWebhook = async (req: Request, res: Response) => {
    if (!verifySignature(
        (req as any).rawBody,
        req.header('x-hub-signature-256')
    )) {
        return res.sendStatus(401);
    }

    try {
        const messages = parseWebhook(req.body);

        await ingestMessages(messages);

        return res.sendStatus(200);
    } catch (e: any) {
        console.error('[Meta] webhook ingestion failed:', e?.message);

        // Allow Meta to retry when a temporary database failure occurs.
        return res.sendStatus(500);
    }
};

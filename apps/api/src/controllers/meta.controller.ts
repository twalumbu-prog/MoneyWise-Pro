import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { decryptToken } from '../lib/tokenCrypto';
import {
    isMetaConfigured, verifySignature, parseWebhook, ingestMessages, graphVersion, saveConnection,
    signConnectState, verifyConnectState, connectWhatsApp, connectPages, subscribePage, unsubscribeApp, parseSignedRequest, MetaGraphError,
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

/** GET /integrations/meta/connect/:platform — what the Connect button needs to open Meta's sign-up. */
export const getMetaConnectUrl = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const platform = String(req.params.platform || '').toUpperCase();
    if (!['WHATSAPP', 'FACEBOOK', 'INSTAGRAM'].includes(platform)) return res.status(400).json({ error: 'Unknown platform' });
    const configId = platform === 'WHATSAPP' ? process.env.META_WA_CONFIG_ID : process.env.META_LOGIN_CONFIG_ID;
    if (!isMetaConfigured() || !configId) return res.status(503).json({ error: 'Meta integration is not configured yet', configured: false });
    if (!(await isCapturePlanEligible(user.organization_id))) return res.status(402).json({ error: PLAN_MESSAGE, code: 'PLAN_LIMIT' });
    res.json({ appId: process.env.META_APP_ID, configId, graphVersion: graphVersion(), state: signConnectState({ organizationId: user.organization_id, userId: user.id }) });
};

/** True when any of these accounts is live under a different business. */
async function takenElsewhere(platform: string, externalIds: string[], organizationId: string): Promise<boolean> {
    const { data } = await supabase.from('messaging_connections').select('organization_id, status').eq('platform', platform).in('external_id', externalIds);
    return (data || []).some((r: any) => r.organization_id !== organizationId && r.status !== 'DISCONNECTED');
}

const TAKEN = (what: string) => `This ${what} is connected to another MoneyWise business. Ask them to disconnect it, or contact MoneyWise support.`;

async function finishWhatsApp(user: any, body: any, res: Response) {
    const { code, wabaId, phoneNumberId } = body;
    if (typeof wabaId !== 'string' || typeof phoneNumberId !== 'string') {
        return res.status(400).json({ error: 'Sign-up did not finish. Pick your WhatsApp number, then try again.' });
    }
    if (await takenElsewhere('WHATSAPP', [phoneNumberId], user.organization_id)) return res.status(409).json({ error: TAKEN('WhatsApp number') });

    const c = await connectWhatsApp({ code, wabaId, phoneNumberId });
    const { data, error } = await saveConnection({
        organizationId: user.organization_id, userId: user.id, platform: 'WHATSAPP', externalId: phoneNumberId, parentExternalId: wabaId,
        displayName: c.displayName, displayPhone: c.displayPhone, accessToken: c.accessToken, expiresAt: c.expiresAt,
    });
    if (error || !data) throw new Error('Could not save the connection');
    await audit(user.organization_id, user.id, data.id, 'MESSAGING_CONNECTED', { platform: 'WHATSAPP', display_phone: c.displayPhone });
    res.json({ success: true, connected: [{ platform: 'WHATSAPP', name: c.displayName ?? c.displayPhone }] });
}

async function finishPages(user: any, body: any, res: Response) {
    const pages = await connectPages(body.code);
    if (pages.length === 0) return res.status(400).json({ error: 'No Pages were shared. Pick a Facebook Page you manage, then try again.' });
    if (body.platform === 'INSTAGRAM' && !pages.some(p => p.instagram)) {
        return res.status(400).json({ error: 'This Instagram account is personal or not linked to your Page. Switch it to Business in the Instagram app, link it to your Page, then try again.' });
    }
    const igIds = pages.flatMap(p => (p.instagram ? [p.instagram.id] : []));
    if (await takenElsewhere('FACEBOOK', pages.map(p => p.id), user.organization_id)) return res.status(409).json({ error: TAKEN('Page') });
    if (igIds.length && await takenElsewhere('INSTAGRAM', igIds, user.organization_id)) return res.status(409).json({ error: TAKEN('Instagram account') });

    // Every Meta call runs first, so a refusal part-way leaves nothing saved.
    for (const p of pages) await subscribePage(p.id, p.token);

    const connected: { platform: string; name: string | null }[] = [];
    for (const p of pages) {
        const fb = await saveConnection({ organizationId: user.organization_id, userId: user.id, platform: 'FACEBOOK', externalId: p.id, displayName: p.name, accessToken: p.token });
        if (fb.error || !fb.data) throw new Error('Could not save the connection');
        await audit(user.organization_id, user.id, fb.data.id, 'MESSAGING_CONNECTED', { platform: 'FACEBOOK', name: p.name });
        connected.push({ platform: 'FACEBOOK', name: p.name });
        if (p.instagram) {
            const ig = await saveConnection({
                organizationId: user.organization_id, userId: user.id, platform: 'INSTAGRAM', externalId: p.instagram.id, parentExternalId: p.id,
                displayName: p.instagram.username ?? undefined, accessToken: p.token,
            });
            if (ig.error || !ig.data) throw new Error('Could not save the connection');
            await audit(user.organization_id, user.id, ig.data.id, 'MESSAGING_CONNECTED', { platform: 'INSTAGRAM', name: p.instagram.username });
            connected.push({ platform: 'INSTAGRAM', name: p.instagram.username });
        }
    }
    res.json({ success: true, connected });
}

/** POST /integrations/meta/callback — finishes sign-up. The org comes from the session and must match the signed state. */
export const metaOAuthCallback = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const body = req.body ?? {};
    const signed = verifyConnectState(body.state);
    if (!signed || signed.organizationId !== user.organization_id || signed.userId !== user.id) {
        return res.status(400).json({ error: 'This connection attempt expired. Please try again.' });
    }
    if (typeof body.code !== 'string') return res.status(400).json({ error: 'Sign-up did not finish. Please try again.' });
    if (!(await isCapturePlanEligible(user.organization_id))) return res.status(402).json({ error: PLAN_MESSAGE, code: 'PLAN_LIMIT' });

    try {
        return await (body.platform === 'FACEBOOK' || body.platform === 'INSTAGRAM' ? finishPages(user, body, res) : finishWhatsApp(user, body, res));
    } catch (e: any) {
        console.error('[Meta] connect failed:', e?.message);
        if (e instanceof MetaGraphError) return res.status(400).json({ error: e.friendly });
        res.status(500).json({ error: 'Could not finish connecting. Please try again.' });
    }
};

/** DELETE /integrations/meta/connections/:id — stops delivery at Meta and locally. Captures and ledger entries stay. */
export const disconnectMeta = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { data: conn } = await supabase.from('messaging_connections').select('id, platform, external_id, parent_external_id, access_token_enc')
        .eq('id', req.params.id).eq('organization_id', user.organization_id).maybeSingle();
    if (!conn) return res.status(404).json({ error: 'Connection not found' });

    // Ingestion ignores DISCONNECTED rows, so messages stop even if Meta can't be reached right now.
    // A WhatsApp account or Page can feed several connections, so only unsubscribe when this is the last one on it.
    const accountId = conn.parent_external_id || conn.external_id;
    const { data: siblings } = await supabase.from('messaging_connections').select('id')
        .eq('organization_id', user.organization_id).neq('id', conn.id).neq('status', 'DISCONNECTED')
        .or(`external_id.eq.${accountId},parent_external_id.eq.${accountId}`);
    let revoked = !!siblings?.length;
    if (conn.access_token_enc && !revoked) {
        try { await unsubscribeApp(accountId, decryptToken(conn.access_token_enc)); revoked = true; }
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

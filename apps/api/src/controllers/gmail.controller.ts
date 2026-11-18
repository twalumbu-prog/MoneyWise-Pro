import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import {
    isGmailConfigured, buildAuthUrl, readState, completeConnection, disconnectConnection, syncAllGmail,
} from '../services/gmail.service';
import { isComposioConfigured, disconnectComposioConnection, syncAllComposio } from '../services/composio.service';

const frontend = () => process.env.FRONTEND_URL || 'https://moneywise.pro';
const backToSettings = (params: Record<string, string>) =>
    `${frontend()}/settings?tab=integrations&integration=gmail&${new URLSearchParams(params)}`;

/** Connecting a mailbox exposes the business's email to the AI: owners/admins/accountants only. */
const CAN_CONNECT = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN'];

/** GET /integrations/gmail/status — the caller's org's mailboxes + whether Google is configured server-side. */
export const getGmailStatus = async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'User does not belong to an organization' });
    const { data, error } = await supabase.from('email_connections')
        .select('id, provider, email_address, status, last_error, last_synced_at, created_at, auth_mode')
        .eq('organization_id', organizationId).neq('status', 'DISCONNECTED').order('created_at');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ configured: isGmailConfigured(), composio: isComposioConfigured(), connections: data || [] });
};

/** GET /integrations/gmail/connect — returns the Google consent URL (the web app navigates to it). */
export const getGmailConnectUrl = async (req: Request, res: Response) => {
    if (!isGmailConfigured()) return res.status(503).json({ error: 'Gmail integration is not configured yet', configured: false });
    const user = (req as any).user;
    if (!user?.organization_id) return res.status(400).json({ error: 'User does not belong to an organization' });
    const role = String(user.role || '').toUpperCase();
    if (role && !CAN_CONNECT.includes(role)) return res.status(403).json({ error: 'Only an owner, admin or accountant can connect a mailbox' });
    res.json({ url: buildAuthUrl(user.organization_id, user.id) });
};

/** GET /integrations/gmail/callback — Google redirects here; no session, identity comes from the signed state. */
export const gmailOAuthCallback = async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) {
        const msg = error === 'access_denied' ? 'Gmail connection was cancelled.' : `Google returned: ${error}`;
        return res.redirect(backToSettings({ gmail: 'error', gmail_message: msg }));
    }
    const who = readState(String(state || ''));
    if (!who) return res.redirect(backToSettings({ gmail: 'error', gmail_message: 'The connection link expired. Please try again.' }));
    if (!code) return res.redirect(backToSettings({ gmail: 'error', gmail_message: 'Google did not return an authorisation code.' }));
    try {
        const { email } = await completeConnection(String(code), who.organizationId, who.userId);
        res.redirect(backToSettings({ gmail: 'connected', gmail_email: email }));
    } catch (e: any) {
        const msg = e?.response?.data?.error_description || e?.message || 'Could not connect Gmail';
        console.error('[Gmail] callback failed:', msg);
        res.redirect(backToSettings({ gmail: 'error', gmail_message: String(msg).slice(0, 200) }));
    }
};

/** DELETE /integrations/gmail/:id — revokes at Google and stops syncing; captured emails are kept. */
export const disconnectGmail = async (req: Request, res: Response) => {
    const organizationId = (req as any).user.organization_id;
    // Quick-connect (Composio) mailboxes are revoked at Composio; anything else is a direct Google connection.
    if (await disconnectComposioConnection('email', String(req.params.id), organizationId)) return res.json({ success: true });
    const ok = await disconnectConnection(String(req.params.id), organizationId);
    if (!ok) return res.status(404).json({ error: 'Connection not found' });
    res.json({ success: true });
};

/** POST /integrations/gmail/sync — internal scheduler entry point, secured with LENCO_SYNC_SECRET like the other crons. */
export const gmailSyncCron = async (req: Request, res: Response) => {
    const secret = process.env.LENCO_SYNC_SECRET;
    if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
    const direct = isGmailConfigured(), quick = isComposioConfigured();
    if (!direct && !quick) return res.json({ skipped: 'not configured' });
    try {
        // One tick serves both connection modes: direct Google first (cheap, own tokens), Composio gets the rest of the budget.
        const started = Date.now();
        const r = direct ? await syncAllGmail(quick ? 7_000 : 15_000) : { connections: [], backlogClassified: 0 };
        const q = quick ? await syncAllComposio(Math.max(5_000, 15_000 - (Date.now() - started))) : { connections: [], backlogClassified: 0 };
        const all = [...r.connections, ...q.connections];
        res.json({
            connections: all.length,
            composio: q.connections.length,
            stored: all.reduce((s, c) => s + c.stored, 0),
            classified: all.reduce((s, c) => s + c.classified, 0) + r.backlogClassified + q.backlogClassified,
            errors: all.filter(c => c.error).map(c => ({ id: c.connectionId, error: c.error })),
        });
    } catch (e: any) {
        console.error('[Gmail] sync tick failed:', e?.message);
        res.status(500).json({ error: e?.message || 'sync failed' });
    }
};

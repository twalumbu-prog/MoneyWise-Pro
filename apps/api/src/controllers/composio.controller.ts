import { Request, Response } from 'express';
import {
    isComposioConfigured, isComposioToolkit, startConnect, completeConnect,
} from '../services/composio.service';

const frontend = () => process.env.FRONTEND_URL || 'https://moneywise.pro';

/** Connecting a mailbox / Page exposes the business's messages to the AI: owners, admins and accountants only. */
const CAN_CONNECT = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN'];

function guard(req: Request, res: Response): { orgId: string; userId: string; toolkit: any } | null {
    const toolkit = String(req.params.toolkit || '').toLowerCase();
    if (toolkit === 'whatsapp') {
        res.status(400).json({ error: 'WhatsApp cannot be read through Quick connect yet. Use the direct WhatsApp connection.' });
        return null;
    }
    if (!isComposioToolkit(toolkit)) { res.status(400).json({ error: 'Unknown channel' }); return null; }
    if (!isComposioConfigured()) { res.status(503).json({ error: 'Quick connect is not configured yet', configured: false }); return null; }
    const user = (req as any).user;
    if (!user?.organization_id) { res.status(400).json({ error: 'User does not belong to an organization' }); return null; }
    const role = String(user.role || '').toUpperCase();
    if (role && !CAN_CONNECT.includes(role)) { res.status(403).json({ error: 'Only an owner, admin or accountant can connect a channel' }); return null; }
    return { orgId: user.organization_id, userId: user.id, toolkit };
}

/** POST /integrations/composio/:toolkit/connect — returns Composio's hosted sign-in URL; the web app navigates to it. */
export const composioConnect = async (req: Request, res: Response) => {
    const g = guard(req, res);
    if (!g) return;
    try {
        // The mobile app passes { returnTo: 'app' }: its auth session closes when the browser reaches the app scheme.
        const appScheme = process.env.MOBILE_APP_SCHEME || 'moneywise';
        const callbackUrl = req.body?.returnTo === 'app'
            ? `${appScheme}://integrations-return?composio=${g.toolkit}`
            : `${frontend()}/settings?tab=integrations&composio=${g.toolkit}`;
        const redirectUrl = await startConnect(g.orgId, g.toolkit, callbackUrl);
        if (!redirectUrl) return res.status(500).json({ error: 'Composio did not return a sign-in link' });
        res.json({ redirectUrl });
    } catch (e: any) {
        console.error('[Composio] connect failed:', e?.message);
        // 500, not 502/504: Cloudflare in front of the web app swaps those for its own HTML page and hides this message.
        res.status(500).json({ error: String(e?.message || 'Could not start the connection').slice(0, 300) });
    }
};

/**
 * POST /integrations/composio/:toolkit/complete — called by the web app when the browser returns from Composio.
 * Body (optional): { externalId, composioAccountId } to choose one Facebook Page. Failures come back as { ok:false, message }
 * with 200 so the card can show them (and the Page picker) instead of a generic error.
 */
export const composioComplete = async (req: Request, res: Response) => {
    const g = guard(req, res);
    if (!g) return;
    const { externalId, composioAccountId } = (req.body || {}) as { externalId?: string; composioAccountId?: string };
    res.json(await completeConnect(g.orgId, g.userId, g.toolkit, {
        externalId: typeof externalId === 'string' ? externalId.trim() : undefined,
        composioAccountId: typeof composioAccountId === 'string' ? composioAccountId.trim() : undefined,
    }));
};

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as momo from '../services/momoCapture/momoCapture.service';
import { nudgeIfWaiting } from '../services/momoCapture/confirmDigest';

/**
 * Mobile money capture. `/ingest` is the one unauthenticated-by-session route: background senders (the Android native
 * listener, the iOS Shortcut) can't hold a refreshing Supabase session, so they present the user's capture token in
 * `X-Capture-Token` instead. That token can only add messages for its owner — it reads and books nothing by itself.
 */
const router = Router();

const fail = (res: any, error: any, label: string) => {
    if (error instanceof momo.MomoCaptureError) return res.status(error.httpStatus).json({ error: error.message });
    console.error(`[MoMo capture] ${label}`, error);
    res.status(500).json({ error: 'Something went wrong with mobile money capture', details: error?.message });
};

router.post('/ingest', async (req: any, res: any) => {
    try {
        const owner = await momo.resolveToken(String(req.get('x-capture-token') || ''));
        if (!owner) return res.status(401).json({ error: 'Capture key is missing or was turned off. Set capture up again in MoneyWise.' });
        const b = req.body ?? {};
        const result = await momo.ingest({ ...owner, source: b.source, text: b.text, sender: b.sender, occurredAt: b.occurredAt });
        // The iPhone's "captured" notification names the workspace, so it's clear where the message went.
        res.json({ ...result, workspace: await momo.workspaceName(owner.orgId) });
    } catch (error) { fail(res, error, 'ingest'); }
});

/** On-phone filter rules for the iOS capture action (key-authenticated so the phone can refresh them by itself). */
router.get('/device-rules', (_req: any, res: any) => res.json(momo.DEVICE_RULES));

/**
 * Record / Dismiss from the prompt the phone shows when a message arrives. The app may be closed, so these also take
 * the capture key. The key can only settle a message that belongs to its own owner and is still waiting.
 */
const settleWithKey = (label: string, fn: (userId: string, orgId: string, id: string) => Promise<any>) => async (req: any, res: any) => {
    try {
        const owner = await momo.resolveToken(String(req.get('x-capture-token') || ''));
        if (!owner) return res.status(401).json({ error: 'Capture key is missing or was turned off. Set capture up again in MoneyWise.' });
        res.json(await fn(owner.userId, owner.orgId, req.params.id));
    } catch (error) { fail(res, error, label); }
};
// After settling one from the prompt, others still waiting get the same "N transactions to confirm" push as the daily
// one (opens the quick-confirm queue), at most every few hours. Never allowed to fail the settle itself.
const thenNudge = async <T>(userId: string, orgId: string, done: Promise<T>): Promise<T> => {
    const r = await done;
    await nudgeIfWaiting(userId, orgId).catch((e: any) => console.error('[MoMo capture] waiting nudge failed:', e?.message));
    return r;
};
router.post('/ingest/:id/post', settleWithKey('prompt post', (userId, orgId, id) => thenNudge(userId, orgId, momo.post(userId, orgId, id))));
router.post('/ingest/:id/dismiss', settleWithKey('prompt dismiss', (userId, orgId, id) => thenNudge(userId, orgId, momo.dismiss(userId, orgId, id))));

router.use(requireAuth);

const handle = (label: string, fn: (req: any) => Promise<any>) => async (req: any, res: any) => {
    try {
        if (!req.user?.organization_id) return res.status(400).json({ error: 'User organization context missing' });
        res.json(await fn(req));
    } catch (error) { fail(res, error, label); }
};

router.get('/settings', handle('settings', (req) => momo.getSettings(req.user.id, req.user.organization_id)));
router.put('/settings', handle('settings', (req) => momo.updateSettings(req.user.id, req.user.organization_id, req.body ?? {})));
router.post('/settings/capture-here', handle('capture-here', (req) => momo.moveCaptureHere(req.user.id, req.user.organization_id)));
router.post('/token', handle('token', async (req) => ({ token: await momo.rotateToken(req.user.id, req.user.organization_id) })));
router.delete('/token', handle('token', async (req) => { await momo.revokeToken(req.user.id); return { ok: true }; }));
router.get('/balances', handle('balances', (req) => momo.balances(req.user.id, req.user.organization_id)));
router.get('/', handle('list', (req) => momo.list(req.user.id, req.user.organization_id, req.query.status)));
router.post('/paste', handle('paste', (req) => momo.ingest({ userId: req.user.id, orgId: req.user.organization_id, source: 'PASTE', text: req.body?.text })));
router.get('/activity', handle('activity', (req) => momo.listWithEntries(req.user.id, req.user.organization_id, req.query.status)));
router.get('/balance-checks/all', handle('balance-all', (req) => momo.listAllBalanceChecks(req.user.id, req.user.organization_id)));
router.get('/ignored', handle('ignored', (req) => momo.listIgnored(req.user.id, req.user.organization_id)));
router.post('/test-parse', handle('test-parse', async (req) => momo.testParse(req.body?.text)));
router.get('/balance-checks', handle('balance-checks', (req) => momo.listBalanceChecks(req.user.id, req.user.organization_id)));
router.post('/balance-checks/:id/adjust', handle('balance-adjust', (req) => momo.adjustToBalance(req.user.id, req.user.organization_id, req.params.id)));
router.post('/balance-checks/:id/dismiss', handle('balance-dismiss', (req) => momo.dismissBalanceCheck(req.user.id, req.user.organization_id, req.params.id)));
router.post('/:id/post', handle('post', (req) => momo.post(req.user.id, req.user.organization_id, req.params.id, req.body ?? {})));
router.post('/:id/dismiss', handle('dismiss', (req) => momo.dismiss(req.user.id, req.user.organization_id, req.params.id)));

export default router;

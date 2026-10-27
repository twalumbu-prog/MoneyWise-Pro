import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as momo from '../services/momoCapture/momoCapture.service';

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
        res.json(await momo.ingest({ ...owner, source: b.source, text: b.text, sender: b.sender, occurredAt: b.occurredAt }));
    } catch (error) { fail(res, error, 'ingest'); }
});

router.use(requireAuth);

const handle = (label: string, fn: (req: any) => Promise<any>) => async (req: any, res: any) => {
    try {
        if (!req.user?.organization_id) return res.status(400).json({ error: 'User organization context missing' });
        res.json(await fn(req));
    } catch (error) { fail(res, error, label); }
};

router.get('/settings', handle('settings', (req) => momo.getSettings(req.user.id, req.user.organization_id)));
router.put('/settings', handle('settings', (req) => momo.updateSettings(req.user.id, req.user.organization_id, req.body ?? {})));
router.post('/token', handle('token', async (req) => ({ token: await momo.rotateToken(req.user.id, req.user.organization_id) })));
router.delete('/token', handle('token', async (req) => { await momo.revokeToken(req.user.id); return { ok: true }; }));
router.get('/', handle('list', (req) => momo.list(req.user.id, req.user.organization_id, req.query.status)));
router.post('/paste', handle('paste', (req) => momo.ingest({ userId: req.user.id, orgId: req.user.organization_id, source: 'PASTE', text: req.body?.text })));
router.post('/:id/post', handle('post', (req) => momo.post(req.user.id, req.user.organization_id, req.params.id, req.body ?? {})));
router.post('/:id/dismiss', handle('dismiss', (req) => momo.dismiss(req.user.id, req.user.organization_id, req.params.id)));

export default router;

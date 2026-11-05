import { Router } from 'express';
import { waitUntil } from '@vercel/functions';
import { requireAuth, requireRole } from '../middleware/auth';
import * as capture from '../services/capture/capture.service';
import { getCaptureSettings, isCapturePlanEligible, updateCaptureSettings } from '../services/capture/capture.settings';
import { drainCaptureJobs } from '../services/capture/capture.worker';
import { emailCaptureStatus, sendTestEmail } from '../services/capture/capture.email';
import { draftReply, sendReply } from '../services/capture/capture.replies';

/**
 * Transaction capture review queue. organization_id always comes from the session (req.user), never the body.
 * Cashiers can view; only Owner/Admin/Accountant change state; only Owner/Admin change the org's capture settings.
 */
const router = Router();
router.use(requireAuth);

const REVIEWERS = ['OWNER', 'ADMIN', 'ACCOUNTANT'];
const UPLOADERS = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'CASHIER'];
const SETTINGS_ROLES = ['OWNER', 'ADMIN'];

const handle = (label: string, fn: (req: any) => Promise<any>) => async (req: any, res: any) => {
    try {
        if (!req.user?.organization_id || req.user.id === 'service-role-admin') return res.status(400).json({ error: 'User organization context missing' });
        res.json(await fn(req));
    } catch (error: any) {
        if (error instanceof capture.CaptureError) return res.status(error.httpStatus).json({ error: error.message });
        console.error(`[Capture] ${label}`, error);
        res.status(500).json({ error: 'Something went wrong with transaction capture' });
    }
};
const org = (req: any): string => req.user.organization_id;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Open to every plan: the app needs these to show an upgrade message and a zero badge.
router.get('/settings', handle('settings', async (req) => ({
    ...(await getCaptureSettings(org(req))),
    planEligible: await isCapturePlanEligible(org(req)),
})));
router.get('/count', handle('count', async (req) => (
    (await isCapturePlanEligible(org(req))) ? capture.count(org(req)) : { needsReview: 0 }
)));
router.get('/by-entry/:entryId', handle('by-entry', async (req) => {
    if (!UUID.test(req.params.entryId) || !(await isCapturePlanEligible(org(req)))) return { capture: null };
    return capture.byEntry(org(req), req.params.entryId);
}));
router.get('/by-customer/:customerId', handle('by-customer', async (req) => {
    if (!UUID.test(req.params.customerId) || !(await isCapturePlanEligible(org(req)))) return { captures: [] };
    return capture.byCustomer(org(req), req.params.customerId);
}));

// Everything below needs an active Premium plan.
router.use(async (req: any, res: any, next: any) => {
    if (await isCapturePlanEligible(req.user?.organization_id)) return next();
    res.status(402).json({ error: 'Transaction capture requires an active Premium plan. Manage your plan under Settings → Subscription & Billing.', code: 'PLAN_LIMIT' });
});

router.put('/settings', requireRole(SETTINGS_ROLES), handle('settings', async (req) => ({
    ...(await updateCaptureSettings(org(req), req.user.id, req.body ?? {})),
    planEligible: true,
})));

router.get('/', handle('list', (req) => capture.list(org(req), req.query)));

router.post('/upload', requireRole(UPLOADERS), handle('upload', async (req) => {
    const r = await capture.createFromUpload(org(req), req.user.id, req.body ?? {});
    // Draft within seconds when possible; the 1-minute worker picks it up otherwise.
    if (!r.duplicate) waitUntil(drainCaptureJobs(25_000).then(() => undefined, (e) => console.error('[Capture] inline drain failed:', e?.message)));
    return r;
}));

router.get('/email', requireRole(REVIEWERS), handle('email', (req) => emailCaptureStatus(org(req))));
router.post('/email/test', requireRole(REVIEWERS), handle('email-test', (req) => sendTestEmail(org(req))));
router.post('/bulk-approve', requireRole(REVIEWERS), handle('bulk-approve', (req) => capture.bulkApprove(org(req), req.user.id, req.body?.ids)));
router.get('/:id', handle('detail', (req) => capture.detail(org(req), req.params.id)));
router.get('/:id/conversation', handle('conversation', (req) => capture.conversation(org(req), req.params.id)));
router.post('/:id/approve', requireRole(REVIEWERS), handle('approve', (req) => capture.approve(org(req), req.user.id, req.params.id, req.body?.edits ?? {})));
router.post('/:id/dismiss', requireRole(REVIEWERS), handle('dismiss', (req) => capture.dismiss(org(req), req.user.id, req.params.id)));
router.post('/:id/merge', requireRole(REVIEWERS), handle('merge', (req) => capture.merge(org(req), req.user.id, req.params.id, req.body ?? {})));
router.post('/:id/contact', requireRole(REVIEWERS), handle('contact', (req) => capture.createContact(org(req), req.user.id, req.params.id)));
router.post('/:id/reply-draft', requireRole(REVIEWERS), handle('reply-draft', (req) => draftReply(org(req), req.params.id)));
router.post('/:id/reply', requireRole(REVIEWERS), handle('reply', (req) => sendReply(org(req), req.user.id, req.params.id, req.body?.text)));
router.post('/:id/undo', requireRole(REVIEWERS), handle('undo', (req) => capture.undo(org(req), req.user.id, req.params.id)));

export default router;

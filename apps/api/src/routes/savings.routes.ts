import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { savingsService, SavingsError } from '../services/savings.service';

/**
 * Savings — wishlist, goals and group savings. Every handler is scoped by the caller's
 * organization and user inside savingsService, so nothing here trusts client-supplied ids
 * beyond looking them up.
 */
const router = Router();

// Public: the invite-link landing pages (web + app) preview a group before anyone logs in.
// It reveals only the name, organiser's first name, member count, target and progress.
router.get('/preview/:code', async (req: any, res: any) => {
    try {
        res.json(await savingsService.preview(req.params.code));
    } catch (error: any) {
        if (error instanceof SavingsError) return res.status(error.httpStatus).json({ error: error.message, code: error.code });
        console.error('[Savings] preview', error);
        res.status(500).json({ error: 'Something went wrong with savings' });
    }
});

router.use(requireAuth);

const handle = (fn: (req: any) => Promise<any>, status = 200) => async (req: any, res: any) => {
    try {
        if (!req.user?.organization_id) return res.status(400).json({ error: 'User organization context missing' });
        res.status(status).json(await fn(req));
    } catch (error: any) {
        if (error instanceof SavingsError) return res.status(error.httpStatus).json({ error: error.message, code: error.code });
        console.error('[Savings]', error);
        res.status(500).json({ error: 'Something went wrong with savings', details: error?.message });
    }
};

router.get('/', handle((req) => savingsService.list(req.user.organization_id, req.user.id)));
router.post('/', handle((req) => savingsService.create({
    orgId: req.user.organization_id, userId: req.user.id,
    kind: req.body?.kind, name: req.body?.name, targetAmount: req.body?.targetAmount, imageUrl: req.body?.imageUrl,
    description: req.body?.description, targetDate: req.body?.targetDate, frequency: req.body?.frequency, productUrl: req.body?.productUrl,
}), 201));
router.post('/join', handle((req) => savingsService.join(req.body?.code, req.user.organization_id, req.user.id)));
router.get('/:id', handle((req) => savingsService.detail(req.params.id, req.user.organization_id, req.user.id)));
router.post('/:id/deposit', handle((req) => savingsService.deposit({
    goalId: req.params.id, orgId: req.user.organization_id, userId: req.user.id,
    amount: req.body?.amount, sourceWalletId: req.body?.sourceWalletId,
})));
router.post('/:id/member-deposit', handle((req) => savingsService.memberWalletDeposit({
    goalId: req.params.id, orgId: req.user.organization_id, userId: req.user.id,
    amount: req.body?.amount, sourceWalletId: req.body?.sourceWalletId,
})));
router.post('/:id/withdraw', handle((req) => savingsService.withdraw({
    goalId: req.params.id, orgId: req.user.organization_id, userId: req.user.id,
    amount: req.body?.amount, destinationWalletId: req.body?.destinationWalletId,
})));
router.post('/:id/contributions', handle((req) => savingsService.contributionIntent({
    goalId: req.params.id, orgId: req.user.organization_id, userId: req.user.id,
    amount: req.body?.amount, reference: req.body?.reference,
}), 201));
router.post('/:id/contributions/:reference/confirm', handle((req) => savingsService.confirmContribution(req.params.id, req.params.reference, req.user.id)));
router.get('/:id/people', handle((req) => savingsService.searchPeople(req.params.id, req.user.organization_id, req.user.id, req.query.q)));
router.post('/:id/members', handle((req) => savingsService.addMember(req.params.id, req.user.organization_id, req.user.id, req.body?.userId), 201));
router.post('/:id/leave', handle((req) => savingsService.leave(req.params.id, req.user.organization_id, req.user.id)));
router.post('/:id/archive', handle((req) => savingsService.archive(req.params.id, req.user.organization_id)));

export default router;

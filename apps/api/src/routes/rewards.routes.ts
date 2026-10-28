import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
    getOverview, getDetail, getInvite, claimReferral, getRedeemables, redeem, getProgram, updateProgram, useVoucher,
} from '../controllers/rewards.controller';

const router = Router();
router.use(requireAuth);

// The person's own rewards
router.get('/', getOverview);
router.get('/redeemables', getRedeemables);
router.get('/invite/:scope', getInvite);
router.post('/referral/claim', claimReferral);
router.get('/programs/:scope', getDetail);
router.post('/programs/:scope/redeem', redeem);

// The business's side
router.get('/program', getProgram);
router.put('/program', requireRole(['ADMIN']), updateProgram);
router.post('/vouchers/use', requireRole(['ADMIN', 'ACCOUNTANT', 'CASHIER']), useVoucher);

export default router;

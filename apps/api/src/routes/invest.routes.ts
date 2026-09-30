import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listInvestmentTargets, walletTransferToInvestmentTarget, recordInvestmentIntent, confirmInvestment } from '../controllers/invest.controller';

const router = Router();

router.use(requireAuth);

router.get('/targets', listInvestmentTargets);
router.post('/wallet-transfer', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), walletTransferToInvestmentTarget);
router.post('/intents', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), recordInvestmentIntent);
router.post('/confirm/:reference', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), confirmInvestment);

export default router;

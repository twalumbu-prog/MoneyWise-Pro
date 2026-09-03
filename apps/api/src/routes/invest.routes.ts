import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listInvestmentTargets, walletTransferToInvestmentTarget } from '../controllers/invest.controller';

const router = Router();

router.use(requireAuth);

router.get('/targets', listInvestmentTargets);
router.post('/wallet-transfer', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), walletTransferToInvestmentTarget);

export default router;

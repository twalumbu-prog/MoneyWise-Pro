import { Router } from 'express';
import { getExpenditure, getExpenditureItems } from '../controllers/report.controller';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/expenditure', requireRole(['AUTHORISER', 'ACCOUNTANT', 'ADMIN', 'MANAGEMENT']), getExpenditure);
router.get('/expenditure/:accountId/items', requireRole(['AUTHORISER', 'ACCOUNTANT', 'ADMIN', 'MANAGEMENT']), getExpenditureItems);

export default router;

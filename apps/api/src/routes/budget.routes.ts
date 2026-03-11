import { Router } from 'express';
import { getBudgets, setBudget } from '../controllers/budget.controller';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole(['AUTHORISER', 'ACCOUNTANT', 'ADMIN']), getBudgets);
router.post('/', requireRole(['ACCOUNTANT', 'ADMIN']), setBudget);

export default router;

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { lenders, readiness, applications, apply, withdraw } from '../controllers/loans.controller';

const router = Router();
router.use(requireAuth);

router.get('/', lenders);
router.get('/readiness', readiness);
router.get('/applications', applications);
router.post('/applications', apply);
router.post('/applications/:id/withdraw', withdraw);

export default router;

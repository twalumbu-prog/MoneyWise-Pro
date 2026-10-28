import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { resolvePayTarget, payWithWallet } from '../controllers/payLink.controller';

const router = Router();
router.use(requireAuth);

router.get('/resolve', resolvePayTarget);
router.post('/pay', payWithWallet);

export default router;

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getProgress, postEvent, convert, redeem } from '../controllers/progress.controller';

const router = Router();
router.use(requireAuth);
router.get('/', getProgress);
router.post('/event', postEvent);
router.post('/convert', convert);
router.post('/redeem', redeem);
export default router;

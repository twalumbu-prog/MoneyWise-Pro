import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listApiKeys, createApiKey, revokeApiKey } from '../controllers/developer.controller';

const router = Router();

router.use(requireAuth);
router.use(requireRole(['ADMIN']));

router.get('/keys', listApiKeys);
router.post('/keys', createApiKey);
router.delete('/keys/:id', revokeApiKey);

export default router;

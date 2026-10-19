import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listApiKeys, createApiKey, revokeApiKey, listConnectedApps, revokeConnectedApp } from '../controllers/developer.controller';

const router = Router();

router.use(requireAuth);
router.use(requireRole(['ADMIN']));

router.get('/keys', listApiKeys);
router.post('/keys', createApiKey);
router.delete('/keys/:id', revokeApiKey);

router.get('/connected-apps', listConnectedApps);
router.delete('/connected-apps/:id', revokeConnectedApp);

export default router;

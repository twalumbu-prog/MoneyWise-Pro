import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listOAuthApps, createOAuthApp, updateOAuthApp, regenerateOAuthSecret, deleteOAuthApp } from '../controllers/oauthApps.controller';
import { listApiKeys, createApiKey, revokeApiKey, listConnectedApps, revokeConnectedApp } from '../controllers/developer.controller';

const router = Router();

router.use(requireAuth);
router.use(requireRole(['ADMIN']));

router.get('/keys', listApiKeys);
router.post('/keys', createApiKey);
router.delete('/keys/:id', revokeApiKey);

router.get('/connected-apps', listConnectedApps);
router.delete('/connected-apps/:id', revokeConnectedApp);

router.get('/oauth-apps', listOAuthApps);
router.post('/oauth-apps', createOAuthApp);
router.patch('/oauth-apps/:id', updateOAuthApp);
router.post('/oauth-apps/:id/regenerate-secret', regenerateOAuthSecret);
router.delete('/oauth-apps/:id', deleteOAuthApp);

export default router;

import { Router } from 'express';
import {
    automationTick,
    listAutomations,
    getAutomationRuns,
    runAutomationNow,
    retryAutomationRun,
    updateAutomation,
    deleteAutomation,
} from '../controllers/automation.controller';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// Cron-driven sweep — secured by LENCO_SYNC_SECRET inside the handler.
router.post('/tick', automationTick);

router.use(requireAuth);

router.get('/', requireRole(['ADMIN', 'AUTHORISER', 'ACCOUNTANT']), listAutomations);
router.get('/:id/runs', requireRole(['ADMIN', 'AUTHORISER', 'ACCOUNTANT']), getAutomationRuns);

// These start or stop real payouts — admins only.
router.post('/:id/run-now', requireRole(['ADMIN']), runAutomationNow);
router.post('/:id/runs/:runId/retry', requireRole(['ADMIN']), retryAutomationRun);
router.patch('/:id', requireRole(['ADMIN']), updateAutomation);
router.delete('/:id', requireRole(['ADMIN']), deleteAutomation);

export default router;

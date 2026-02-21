import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ruleController from '../controllers/rule.controller';
import * as metricsController from '../controllers/metrics.controller';

const router = Router();

// Rule Management (Admin/Accountant only)
router.get('/rules', requireAuth, requireRole(['ADMIN', 'ACCOUNTANT']), ruleController.getRules);
router.post('/rules', requireAuth, requireRole(['ADMIN', 'ACCOUNTANT']), ruleController.createRule);
router.patch('/rules/:id', requireAuth, requireRole(['ADMIN', 'ACCOUNTANT']), ruleController.updateRule);
router.delete('/rules/:id', requireAuth, requireRole(['ADMIN', 'ACCOUNTANT']), ruleController.deleteRule);

// AI Metrics & Stats
router.get('/metrics/daily', requireAuth, requireRole(['ADMIN', 'ACCOUNTANT']), metricsController.getDailyMetrics);
router.get('/metrics/stats', requireAuth, requireRole(['ADMIN', 'ACCOUNTANT']), metricsController.getClassificationStats);

export default router;

import { Router } from 'express';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth';
import * as ruleController from '../controllers/rule.controller';
import * as metricsController from '../controllers/metrics.controller';
import * as aiController from '../controllers/ai.controller';
import {
    getFinancialHighlights,
    acknowledgeAchievements,
    sendWeeklyHighlightsEmail,
} from '../controllers/highlights.controller';

const router = Router();

// Assistant & Intelligence
router.post('/assistant', requireAuth, aiController.assistantChat);

// Financial Highlights — headline weekly figures, category breakdown and
// business records for the Reports screen.
router.get('/highlights', requireAuth, getFinancialHighlights);
router.post('/highlights/acknowledge', requireAuth, acknowledgeAchievements);

// Weekly newsletter. Secured inside the handler: either the cron secret
// (LENCO_SYNC_SECRET) or a signed-in ADMIN, so requireAuth can't sit here.
router.post('/highlights/weekly-email', optionalAuth, sendWeeklyHighlightsEmail);

// Legacy alias: the web app is a PWA, so clients running a cached bundle from
// before the Financial Digest -> Financial Highlights rename still call this.
// Serves the same payload (the old client only reads `cards`).
router.get('/digest', requireAuth, getFinancialHighlights);

// Rule Management (Admin/Accountant only)
router.get('/rules', requireAuth, requireRole(['ADMIN', 'ACCOUNTANT']), ruleController.getRules);
router.post('/rules', requireAuth, requireRole(['ADMIN', 'ACCOUNTANT']), ruleController.createRule);
router.patch('/rules/:id', requireAuth, requireRole(['ADMIN', 'ACCOUNTANT']), ruleController.updateRule);
router.delete('/rules/:id', requireAuth, requireRole(['ADMIN', 'ACCOUNTANT']), ruleController.deleteRule);

// AI Metrics & Stats
router.get('/metrics/daily', requireAuth, requireRole(['ADMIN', 'ACCOUNTANT']), metricsController.getDailyMetrics);
router.get('/metrics/stats', requireAuth, requireRole(['ADMIN', 'ACCOUNTANT']), metricsController.getClassificationStats);

export default router;

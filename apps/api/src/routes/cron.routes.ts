import { Router } from 'express';
import { autoCompleteSweep, healFeesCron, cronWatchdog, dailyReconCron } from '../controllers/cron.controller';

const router = Router();

// Internal scheduler entry points - secured inside each handler via LENCO_SYNC_SECRET (no requireAuth).
router.post('/auto-sweep', autoCompleteSweep);
router.post('/heal-fees', healFeesCron);
router.post('/watchdog', cronWatchdog);
router.post('/daily-recon', dailyReconCron);

export default router;

import { Router } from 'express';
import {
    autoCompleteSweep,
    healFeesCron,
    cronWatchdog,
    captureWorker,
    captureDigest,
    metaTokenHealth,
    captureRetention,
    importRefresh,
    fundFeeds,
    dailyReconCron,
    mtnPayoutsCron,
    trackingHealthCron,
} from '../controllers/cron.controller';

const router = Router();

// Internal scheduler entry points - secured inside each handler via LENCO_SYNC_SECRET (no requireAuth).
router.post('/auto-sweep', autoCompleteSweep);
router.post('/heal-fees', healFeesCron);
router.post('/watchdog', cronWatchdog);
router.post('/capture-worker', captureWorker);
router.post('/capture-digest', captureDigest);
router.post('/meta-token-health', metaTokenHealth);
router.post('/capture-retention', captureRetention);
router.post('/import-refresh', importRefresh);
router.post('/fund-feeds', fundFeeds);
router.post('/daily-recon', dailyReconCron);
router.post('/mtn-payouts', mtnPayoutsCron);
router.post('/tracking-health', trackingHealthCron);

export default router;

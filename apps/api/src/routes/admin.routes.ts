import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import {
    whoami,
    getReconciliationList,
    getOrgReconciliation,
} from '../controllers/admin.reconciliation.controller';
import {
    listWalletPool,
    addPoolWallet,
    updatePoolWallet,
    getActivationSettings,
    updateActivationSettings,
} from '../controllers/admin.walletpool.controller';
import {
    testCollectionInitiate,
    testCollectionStatusCheck,
} from '../controllers/admin.testcollection.controller';
import {
    getPaymentLinkAnalyticsHandler,
    getPaymentLinkAttemptsHandler,
    setPostHogKeyHandler,
} from '../controllers/admin.analytics.controller';
import { getVercelLogs } from '../controllers/admin.logs.controller';

const router = Router();

// Every /admin route requires a valid Supabase session AND super-admin allowlisting.
router.use(requireAuth, requireSuperAdmin);

router.get('/me', whoami);
router.get('/reconciliation', getReconciliationList);
router.get('/reconciliation/:orgId', getOrgReconciliation);

// Wallet pool provisioning (pre-created Lenco accounts linked during onboarding)
router.get('/wallet-pool', listWalletPool);
router.post('/wallet-pool', addPoolWallet);
router.patch('/wallet-pool/:id', updatePoolWallet);
router.get('/wallet-pool/settings', getActivationSettings);
router.put('/wallet-pool/settings', updateActivationSettings);

// TEMPORARY: Collections API migration test harness (live account, own-UX checkout prototype)
router.post('/test-collection/initiate', testCollectionInitiate);
router.get('/test-collection/status/:reference', testCollectionStatusCheck);

router.get('/analytics/payment-links', getPaymentLinkAnalyticsHandler);
router.get('/analytics/payment-links/attempts', getPaymentLinkAttemptsHandler);
router.put('/analytics/posthog-key', setPostHogKeyHandler);

router.get('/logs', getVercelLogs);

export default router;

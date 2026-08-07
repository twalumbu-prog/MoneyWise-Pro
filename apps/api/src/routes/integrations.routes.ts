import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
    connectQuickBooks,
    quickBooksCallback,
    getIntegrationStatus,
    getQuickBooksAccounts,
    disconnectQuickBooks,
    syncRequisition
} from '../controllers/integrations.controller';
import {
    getMasterFeesOAuthUrl,
    masterFeesOAuthCallback,
    masterFeesDiag,
    connectMasterFees,
    getMasterFeesStatus,
    disconnectMasterFees,
    getMasterFeesFeeCategories,
    updateMasterFeesCategoryMapping,
    updateMasterFeesLencoMode,
    syncMasterFeesNow,
    getMasterFeesReconciliation,
    syncAllMasterFees
} from '../controllers/masterfees.controller';

const router = Router();

// OAuth flow
router.get('/quickbooks/connect', requireAuth, connectQuickBooks);
router.get('/quickbooks/callback', quickBooksCallback); // No auth for callback as it handles redirect
router.delete('/quickbooks', requireAuth, disconnectQuickBooks);

// Status and Data
router.get('/status', requireAuth, getIntegrationStatus);
router.get('/quickbooks/accounts', requireAuth, getQuickBooksAccounts);
router.post('/quickbooks/sync/:id', requireAuth, syncRequisition);

// ── Master Fees ──────────────────────────────────────────────────────────────
// Cron sync (secured inside the handler via MASTERFEES_SYNC_SECRET/LENCO_SYNC_SECRET).
router.post('/masterfees/sync-all', syncAllMasterFees);

// OAuth 1-click flow.
router.get('/masterfees/oauth/url', requireAuth, getMasterFeesOAuthUrl);
router.get('/masterfees/oauth/callback', masterFeesOAuthCallback); // No auth — called by Master Fees

// TEMPORARY diagnostic endpoint — remove once the egress/IP issue is resolved.
router.get('/masterfees/diag', requireAuth, masterFeesDiag);

router.post('/masterfees/connect', requireAuth, connectMasterFees);
router.get('/masterfees/status', requireAuth, getMasterFeesStatus);
router.delete('/masterfees', requireAuth, disconnectMasterFees);
router.get('/masterfees/fee-categories', requireAuth, getMasterFeesFeeCategories);
router.put('/masterfees/fee-categories', requireAuth, updateMasterFeesCategoryMapping);
router.put('/masterfees/lenco-mode', requireAuth, updateMasterFeesLencoMode);
router.post('/masterfees/sync', requireAuth, syncMasterFeesNow);
router.get('/masterfees/reconcile', requireAuth, getMasterFeesReconciliation);

export default router;

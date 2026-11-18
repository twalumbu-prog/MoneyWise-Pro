import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import * as importsAdmin from '../controllers/imports.controller';
import * as priceDesk from '../controllers/priceCompare.controller';
import * as rfqAdmin from '../controllers/rfq.controller';
import {
    whoami,
    getReconciliationList,
    getOrgReconciliation,
    getRawLencoTxns,
    healOrgPlatformFees,
    healAllOrgsPlatformFees,
  getLedgerHealth,
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
import { getLedgerAudit, healLedger } from '../controllers/admin.ledger.controller';
import { getCronHealth } from '../controllers/cron.controller';
import { adminAds, adminApprove, adminReject } from '../controllers/marketplaceAds.controller';

const router = Router();

// Every /admin route requires a valid Supabase session AND super-admin allowlisting.
router.use(requireAuth, requireSuperAdmin);

router.get('/me', whoami);
router.get('/ledger-health', getLedgerHealth);
router.get('/cron-health', getCronHealth);
router.get('/reconciliation', getReconciliationList);
router.get('/reconciliation/:orgId', getOrgReconciliation);
router.get('/reconciliation/:orgId/raw-lenco-txns', getRawLencoTxns);
router.post('/reconciliation/heal-platform-fees', healAllOrgsPlatformFees);
router.post('/reconciliation/:orgId/heal-platform-fees', healOrgPlatformFees);

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

// MoneyWise Ads: review the Marketplace ads sellers have paid for
router.get('/ads', adminAds);
router.post('/ads/:id/approve', adminApprove);
router.post('/ads/:id/reject', adminReject);

// Imported products: the purchasing queue, tracking, the catalogue and its prices
// Price desk: the catalogue and prices collected from places that aren't MoneyWise sellers
router.get('/price-desk', priceDesk.deskOverview);
router.post('/price-desk/items', priceDesk.saveItem);
router.patch('/price-desk/items/:id', priceDesk.saveItem);
router.post('/price-desk/prices', priceDesk.savePrice);
router.patch('/price-desk/prices/:id', priceDesk.savePrice);
router.post('/price-desk/prices/:id/status', priceDesk.priceStatus);
router.get('/price-desk/reports', priceDesk.reviewQueue);
router.post('/price-desk/reports/:id/approve', priceDesk.approveReport);
router.post('/price-desk/reports/:id/reject', priceDesk.rejectReport);
router.get('/price-desk/rfq', rfqAdmin.adminOpen);
router.post('/price-desk/rfq/:id/quotes', rfqAdmin.teamQuote);

router.get('/imports', importsAdmin.adminOverview);
router.patch('/imports/orders/:id', importsAdmin.adminUpdateOrder);
router.post('/imports/orders/:id/cancel', importsAdmin.adminCancelOrder);
router.post('/imports/products', importsAdmin.adminSaveProduct);
router.patch('/imports/products/:id', importsAdmin.adminSaveProduct);
router.post('/imports/products/:id/refresh', importsAdmin.adminRefreshProduct);
router.post('/imports/search', importsAdmin.adminSearch);
router.post('/imports/add', importsAdmin.adminAdd);
router.put('/imports/settings', importsAdmin.adminSaveSettings);
router.post('/imports/refresh-now', importsAdmin.adminRefreshNow);

// Ledger integrity: do the books tie to the wallets? (+ one-click repair)
router.get('/ledger-audit/:orgId', getLedgerAudit);
router.post('/ledger-audit/:orgId/heal', healLedger);

export default router;

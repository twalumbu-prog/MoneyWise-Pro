import { Router } from 'express';
import { handleLencoWebhook } from '../controllers/lenco.webhook.controller';
import { 
    listLencoAccounts, 
    provisionOrganizationLencoAccount, 
    listAvailableAccounts, 
    linkOrganizationLencoAccount, 
    verifyCollectionStatus,
    getReconciliationSummary,
    getBanks,
    resolveBankAccount,
    resolveMobileMoney,
    getPublicWalletContext,
    logPublicWalletDepositIntent,
    getSaleReceiptDetails,
    getPublicSalesByPhone,
    getPublicSaleReceiptDetails,
    syncAllLencoTransactions
} from '../controllers/lenco.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Public webhook endpoint (Lenco will POST here)
router.post('/webhook', handleLencoWebhook);

// Public payment portal endpoints
router.get('/public-verify-status/:reference', verifyCollectionStatus);
router.get('/public-context/:wallet_id', getPublicWalletContext);
router.post('/public-wallet-deposit-intent', logPublicWalletDepositIntent);
router.get('/public-sales/by-phone/:phone', getPublicSalesByPhone);
router.get('/public-sale-receipt/:reference', getPublicSaleReceiptDetails);

// Cron sync endpoint (secured inside the handler via LENCO_SYNC_SECRET)
router.post('/sync', syncAllLencoTransactions);

// Protected routes
router.use(requireAuth);
router.get('/accounts', listLencoAccounts);
router.get('/available-accounts', listAvailableAccounts);
router.post('/organizations/:id/provision', provisionOrganizationLencoAccount);
router.post('/organizations/:id/link', linkOrganizationLencoAccount);
router.get('/verify-status/:reference', verifyCollectionStatus);
router.get('/reconcile/:organizationId', getReconciliationSummary);
router.get('/banks', getBanks);
router.post('/resolve-bank', resolveBankAccount);
router.post('/resolve-momo', resolveMobileMoney);
router.get('/sale-receipt/:entryId', getSaleReceiptDetails);

export default router;

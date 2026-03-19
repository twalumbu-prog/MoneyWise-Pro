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
    resolveMobileMoney
} from '../controllers/lenco.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Public webhook endpoint (Lenco will POST here)
router.post('/webhook', handleLencoWebhook);

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

export default router;

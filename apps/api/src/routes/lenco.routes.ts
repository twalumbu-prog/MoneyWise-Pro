import { Router } from 'express';
import { handleLencoWebhook } from '../controllers/lenco.webhook.controller';
import { 
    listLencoAccounts, 
    provisionOrganizationLencoAccount, 
    listAvailableAccounts, 
    linkOrganizationLencoAccount, 
    verifyCollectionStatus,
    getReconciliationSummary
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

export default router;

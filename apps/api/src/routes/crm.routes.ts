import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
    listCustomers,
    createCustomer,
    getCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerTransactions
} from '../controllers/crm.controller';
import {
    getLoyaltyOverview,
    getCustomerLoyalty,
    previewCampaignAudience,
    sendCampaign,
    draftCampaignEmail
} from '../controllers/crmLoyalty.controller';

const router = Router();

router.use(requireAuth);

router.get('/customers', listCustomers);
router.post('/customers', createCustomer);
router.get('/customers/:id', getCustomer);
router.patch('/customers/:id', updateCustomer);
router.delete('/customers/:id', deleteCustomer);
router.get('/customers/:id/transactions', getCustomerTransactions);

router.get('/loyalty', getLoyaltyOverview);
router.get('/customers/:id/loyalty', getCustomerLoyalty);

// Emailing customers speaks for the business, so it is limited to the people who manage it.
router.post('/campaigns/preview', requireRole(['ADMIN', 'ACCOUNTANT']), previewCampaignAudience);
router.post('/campaigns/send', requireRole(['ADMIN', 'ACCOUNTANT']), sendCampaign);
router.post('/campaigns/draft', requireRole(['ADMIN', 'ACCOUNTANT']), draftCampaignEmail);

export default router;

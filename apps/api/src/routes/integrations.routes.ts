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

const router = Router();

// OAuth flow
router.get('/quickbooks/connect', requireAuth, connectQuickBooks);
router.get('/quickbooks/callback', quickBooksCallback); // No auth for callback as it handles redirect
router.delete('/quickbooks', requireAuth, disconnectQuickBooks);

// Status and Data
router.get('/status', requireAuth, getIntegrationStatus);
router.get('/quickbooks/accounts', requireAuth, getQuickBooksAccounts);
router.post('/quickbooks/sync/:id', requireAuth, syncRequisition);

export default router;

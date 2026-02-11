import { Router } from 'express';
import { authenticate } from '../middleware/auth';
quickBooksCallback,
    getIntegrationStatus,
    getQuickBooksAccounts,
    disconnectQuickBooks,
    syncRequisition
} from '../controllers/integrations.controller';

const router = Router();

// OAuth flow
router.get('/quickbooks/connect', authenticate, connectQuickBooks);
router.get('/quickbooks/callback', quickBooksCallback); // No auth for callback as it handles redirect
router.delete('/quickbooks', authenticate, disconnectQuickBooks);

// Status and Data
router.get('/status', authenticate, getIntegrationStatus);
router.get('/quickbooks/accounts', authenticate, getQuickBooksAccounts);
router.post('/quickbooks/sync/:id', authenticate, syncRequisition);

export default router;

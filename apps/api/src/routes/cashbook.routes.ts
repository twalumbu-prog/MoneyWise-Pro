import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
    getCashbookEntries,
    getCashBalance,
    getCashbookSummary,
    reconcileCash,
    returnExcessCash,
    closeBook
} from '../controllers/cashbook.controller';

const router = Router();

// All cashbook routes require authentication
router.use(requireAuth);

// Get cashbook entries (All roles can view for transparency)
router.get('/', requireRole(['REQUESTOR', 'AUTHORISER', 'CASHIER', 'ACCOUNTANT', 'ADMIN']), getCashbookEntries);

// Get current balance (All roles can view)
router.get('/balance', requireRole(['REQUESTOR', 'AUTHORISER', 'CASHIER', 'ACCOUNTANT', 'ADMIN']), getCashBalance);

// Get summary for date range (All management roles)
router.get('/summary', requireRole(['AUTHORISER', 'CASHIER', 'ACCOUNTANT', 'ADMIN']), getCashbookSummary);

// Reconcile cash (Cashier, Admin)
router.post('/reconcile', requireRole(['CASHIER', 'ADMIN']), reconcileCash);

// Return excess cash (Cashier, Admin)
router.post('/return', requireRole(['CASHIER', 'ADMIN']), returnExcessCash);

// Close book (Cashier, Accountant, Admin)
router.post('/close', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), closeBook);

export default router;

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
    getCashbookEntries,
    getCashBalance,
    getCashbookSummary,
    reconcileCash,
    returnExcessCash,
    logCashInflow,
    closeBook,
    classifyBulk,
    postEntryToQuickBooks,
    updateEntryAccount,
    logWalletDepositIntent,
    narrateEntry
} from '../controllers/cashbook.controller';

const router = Router();

// All cashbook routes require authentication
router.use(requireAuth);

// Get cashbook entries (All roles can view for transparency)
router.get('/', requireRole(['REQUESTOR', 'AUTHORISER', 'CASHIER', 'ACCOUNTANT', 'ADMIN']), getCashbookEntries);

// Get current balance (All roles can view)
router.get('/balance', requireRole(['REQUESTOR', 'AUTHORISER', 'CASHIER', 'ACCOUNTANT', 'ADMIN']), getCashBalance);

// Diagnostic route to check if post-to-qb is registered
router.get('/check-routes', (req, res) => {
    res.json({
        routes: (router as any).stack
            .filter((r: any) => r.route)
            .map((r: any) => ({
                path: r.route.path,
                methods: Object.keys(r.route.methods || {})
            }))
    });
});

// Get summary for date range (All management roles)
router.get('/summary', requireRole(['AUTHORISER', 'CASHIER', 'ACCOUNTANT', 'ADMIN']), getCashbookSummary);

// Reconcile cash (Cashier, Admin)
router.post('/reconcile', requireRole(['CASHIER', 'ADMIN']), reconcileCash);

// Return excess cash (Cashier, Admin)
router.post('/return', requireRole(['CASHIER', 'ADMIN']), returnExcessCash);

// Log cash inflow (Cashier, Accountant, Admin)
router.post('/inflow', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), logCashInflow);

// Log wallet deposit intent (Cashier, Accountant, Admin)
router.post('/wallet-deposit-intent', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), logWalletDepositIntent);

// Close book (Cashier, Accountant, Admin)
router.post('/close', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), closeBook);

// Bulk classify transactions (Cashier, Accountant, Admin)
router.post('/classify-bulk', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), classifyBulk);

// Post to QuickBooks (Cashier, Accountant, Admin)
router.post('/post-to-qb', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), postEntryToQuickBooks);

// Update entry account (Cashier, Accountant, Admin)
router.patch('/:entryId/account', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), updateEntryAccount);

// Narrate entry (Cashier, Accountant, Admin)
router.patch('/:entryId/narrate', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), narrateEntry);

export default router;

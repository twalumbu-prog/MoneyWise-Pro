import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
    getCashbookEntries,
    getCashBalance,
    getCashbookOverview,
    getCashbookSummary,
    reconcileCash,
    returnExcessCash,
    logCashInflow,
    recordManualSale,
    closeBook,
    classifyBulk,
    postEntryToQuickBooks,
    createQbAccount,
    updateEntryAccount,
    logWalletDepositIntent,
    narrateEntry,
    getWallets,
    createWallet,
    transferSubwalletFunds,
    transferCashToWallet
} from '../controllers/cashbook.controller';

const router = Router();

// All cashbook routes require authentication
router.use(requireAuth);

// Get subwallets
router.get('/wallets', requireRole(['REQUESTOR', 'AUTHORISER', 'CASHIER', 'ACCOUNTANT', 'ADMIN']), getWallets);

// Create subwallet
router.post('/wallets', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), createWallet);

// Transfer funds between subwallets
router.post('/wallets/transfer', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), transferSubwalletFunds);

// Transfer from an external account (cash/mobile money/bank) into a MoneyWise wallet
router.post('/transfer-to-wallet', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), transferCashToWallet);

// Get cashbook entries (All roles can view for transparency)
router.get('/', requireRole(['REQUESTOR', 'AUTHORISER', 'CASHIER', 'ACCOUNTANT', 'ADMIN']), getCashbookEntries);

// Get current balance (All roles can view)
router.get('/balance', requireRole(['REQUESTOR', 'AUTHORISER', 'CASHIER', 'ACCOUNTANT', 'ADMIN']), getCashBalance);

// One-round-trip Wallet page payload: entries + balances + wallets + recent samples
router.get('/overview', requireRole(['REQUESTOR', 'AUTHORISER', 'CASHIER', 'ACCOUNTANT', 'ADMIN']), getCashbookOverview);

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

// Record a manual (cash / mobile money / bank) product sale (Requestor, Cashier, Accountant, Admin)
router.post('/manual-sale', requireRole(['REQUESTOR', 'CASHIER', 'ACCOUNTANT', 'ADMIN']), recordManualSale);

// Log wallet deposit intent (Cashier, Accountant, Admin)
router.post('/wallet-deposit-intent', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), logWalletDepositIntent);

// Close book (Cashier, Accountant, Admin)
router.post('/close', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), closeBook);

// Bulk classify transactions (Cashier, Accountant, Admin)
router.post('/classify-bulk', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), classifyBulk);

// Post to QuickBooks (Cashier, Accountant, Admin)
router.post('/post-to-qb', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), postEntryToQuickBooks);

// Create a new QuickBooks account for an existing local chart-of-accounts row (Admin only)
router.post('/create-qb-account', requireRole(['ADMIN']), createQbAccount);

// Update entry account (Cashier, Accountant, Admin)
router.patch('/:entryId/account', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), updateEntryAccount);

// Narrate entry (Cashier, Accountant, Admin)
router.patch('/:entryId/narrate', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), narrateEntry);

export default router;

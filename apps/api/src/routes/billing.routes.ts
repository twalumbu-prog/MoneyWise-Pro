import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
    getSubscription,
    upgradeToPremium,
    downgradeToFree,
    generateInvoice,
    initiateInvoicePayment,
    initiateInvoiceMobileMoneyPayment,
    checkInvoiceMobileMoneyStatus,
    getInvoiceReceipt,
    billingTick,
} from '../controllers/billing.controller';

const router = Router();

// Cron entry point — secured inside the handler via LENCO_SYNC_SECRET, so it sits before requireAuth.
router.post('/tick', billingTick);

router.use(requireAuth);

router.get('/subscription',               getSubscription);
router.post('/upgrade',                   upgradeToPremium);
router.post('/downgrade',                 downgradeToFree);
router.post('/generate-invoice',          generateInvoice);
router.post('/pay/:invoiceId',                         initiateInvoicePayment);
router.post('/pay/:invoiceId/mobile-money',            initiateInvoiceMobileMoneyPayment);
router.get('/pay/:invoiceId/mobile-money/status',      checkInvoiceMobileMoneyStatus);
router.get('/invoice/:invoiceId/receipt',              getInvoiceReceipt);

export default router;

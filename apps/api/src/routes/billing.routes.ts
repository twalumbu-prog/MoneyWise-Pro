import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
    getSubscription,
    upgradeToPremium,
    downgradeToFree,
    generateInvoice,
    initiateInvoicePayment,
    getInvoiceReceipt,
} from '../controllers/billing.controller';

const router = Router();

router.use(requireAuth);

router.get('/subscription',               getSubscription);
router.post('/upgrade',                   upgradeToPremium);
router.post('/downgrade',                 downgradeToFree);
router.post('/generate-invoice',          generateInvoice);
router.post('/pay/:invoiceId',            initiateInvoicePayment);
router.get('/invoice/:invoiceId/receipt', getInvoiceReceipt);

export default router;

import { Router } from 'express';
import {
    requireLinkSecret, linkStatus, linkListInvoices, linkOpenInvoices, linkPostInvoice, linkVoidInvoice,
    linkPostReceipt, linkInflows, linkAllocate,
} from '../controllers/dashboardLink.controller';

// The Blue Opus dashboard's invoicing, linked to one MoneyWise business. Every route needs DASHBOARD_LINK_SECRET (see the controller).
const router = Router();
router.use(requireLinkSecret);

router.get('/status', linkStatus);
router.get('/invoices', linkListInvoices);
router.get('/open-invoices', linkOpenInvoices);
router.post('/invoices', linkPostInvoice);
router.post('/invoices/:id/void', linkVoidInvoice);
router.post('/receipts', linkPostReceipt);
router.get('/inflows', linkInflows);
router.post('/allocate', linkAllocate);

export default router;

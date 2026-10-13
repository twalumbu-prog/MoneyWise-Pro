import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
    createCreditSale,
    listInvoices,
    listOpen,
    getInvoice,
    downloadInvoicePdf,
    sendInvoice,
    voidCreditSale,
    entryAllocations,
    allocate,
    payLink,
    reminderTick,
} from '../controllers/invoice.controller';

const router = Router();

// Cron entry point — secured inside the handler via LENCO_SYNC_SECRET, so it sits before requireAuth.
router.post('/tick', reminderTick);

router.use(requireAuth);

// Credit sales are handled by the same people who can record sales and classify wallet money.
const handlers = requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']);

router.get('/', handlers, listInvoices);
router.get('/open', handlers, listOpen);
router.get('/allocations/:entryId', handlers, entryAllocations);
router.post('/', handlers, createCreditSale);
router.post('/allocate', handlers, allocate);
router.get('/:id', handlers, getInvoice);
router.get('/:id/pdf', handlers, downloadInvoicePdf);
router.post('/:id/send', handlers, sendInvoice);
router.post('/:id/pay-link', handlers, payLink);
router.post('/:id/void', handlers, voidCreditSale);

export default router;

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
    createPaymentLink,
    createInvoiceLink,
    listPaymentLinks,
    deactivatePaymentLink,
    archivePaymentLink,
    updatePaymentLink,
} from '../controllers/payment_link.controller';

const router = Router();

router.use(requireAuth); // Protect all routes

router.get('/', listPaymentLinks);
router.post('/', createPaymentLink);
router.post('/invoice', createInvoiceLink);
router.post('/:id/deactivate', deactivatePaymentLink);
router.patch('/:id/archive', archivePaymentLink);
router.patch('/:id', updatePaymentLink);

export default router;

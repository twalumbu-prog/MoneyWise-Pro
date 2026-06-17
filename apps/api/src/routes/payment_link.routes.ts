import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
    createPaymentLink,
    listPaymentLinks,
    deactivatePaymentLink
} from '../controllers/payment_link.controller';

const router = Router();

router.use(requireAuth); // Protect all routes

router.get('/', listPaymentLinks);
router.post('/', createPaymentLink);
router.post('/:id/deactivate', deactivatePaymentLink);

export default router;

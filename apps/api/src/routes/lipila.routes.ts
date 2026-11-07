import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import * as c from '../controllers/lipila.controller';

const router = Router();

// Customers paying by card: no sign-in. The sale was recorded by the checkout; these only start the card payment and read its outcome.
router.post('/public/card', c.initiate);
router.get('/public/status/:reference', c.status);

// The owner's settings.
router.use(requireAuth);
router.get('/wallet', requireRole(['AUTHORISER', 'CASHIER', 'ACCOUNTANT', 'ADMIN']), c.wallet);
router.get('/card-payments', requireRole(['AUTHORISER', 'CASHIER', 'ACCOUNTANT', 'ADMIN']), c.cardPayments);
router.get('/settings', c.getSettings);
router.put('/settings', c.saveSettings);
router.post('/settings/test', c.testSettings);
router.delete('/settings', c.removeSettings);

export default router;

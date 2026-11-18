import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as c from '../controllers/tap.controller';

const router = Router();
router.use(requireAuth);

// The receiver's setting and their requests
router.get('/settings', c.getSettings);
router.put('/settings', c.putSettings);
router.post('/requests', c.create);
router.get('/requests/:id/status', c.status);
router.post('/requests/:id/cancel', c.cancel);

// The payer: look at a request by its code, reserve it, link the payment
router.get('/r/:code', c.resolve);
router.post('/r/:code/claim', c.claim);
router.post('/r/:code/attach', c.attach);

export default router;

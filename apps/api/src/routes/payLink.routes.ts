import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { resolvePayTarget, payWithWallet, createStoreLink, getStoreLinkStatus } from '../controllers/payLink.controller';

const router = Router();

// Public: the store's "MoneyWise" payment option (the payer may not be signed in on this browser).
router.post('/store-link', createStoreLink);
router.get('/store-link/:token', getStoreLinkStatus);

router.use(requireAuth);

router.get('/resolve', resolvePayTarget);
router.post('/pay', payWithWallet);

export default router;

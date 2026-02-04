import { Router } from 'express';
import { getVouchers, getVoucherById, createVoucherFromRequisition, postVoucher } from '../controllers/voucher.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', getVouchers);
router.get('/:id', getVoucherById);
router.post('/', createVoucherFromRequisition);
router.post('/:id/post', postVoucher);

export default router;

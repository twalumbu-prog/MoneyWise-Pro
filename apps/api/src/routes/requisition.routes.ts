import { Router } from 'express';
import {
    createRequisition,
    getRequisitions,
    getRequisitionById,
    updateRequisition,
    getAllRequisitionsAdmin,
    updateRequisitionStatus,
    updateRequisitionExpenses,
    submitChange,
    confirmChange,
    markRequisitionRead
} from '../controllers/requisition.controller';
import { disburseRequisition, acknowledgeReceipt } from '../controllers/disbursement.controller';
import { postVoucher } from '../controllers/accounting.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// Admin/Accountant routes
router.get('/admin/all', getAllRequisitionsAdmin);
router.patch('/:id/status', updateRequisitionStatus);

// Disbursement routes
router.post('/:id/disburse', disburseRequisition);
router.post('/:id/acknowledge', acknowledgeReceipt);

// Expense Tracking & Change Flow
router.put('/:id/expenses', updateRequisitionExpenses);
router.post('/:id/submit-change', submitChange);
router.post('/:id/confirm-change', confirmChange);
router.post('/:id/post-voucher', postVoucher);

// Standard routes
router.post('/', createRequisition);
router.post('/:id/mark-read', markRequisitionRead);
router.get('/', getRequisitions);
router.get('/:id', getRequisitionById);
router.put('/:id', updateRequisition);

export default router;

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
    markRequisitionRead,
    analyzeReceiptItem,
    getRequisitionMessages,
    sendRequisitionMessage,
    approveCategorization,
    retriggerAICategorization,
    postToQuickBooks,
    scanReceipts,
    deleteReceipt,
    deleteRequisitionMessage
} from '../controllers/requisition.controller';
import { 
    disburseRequisition, 
    acknowledgeReceipt, 
    getDisbursementHistory, 
    updateDisbursement,
    analyzeDisbursementProof,
    verifyDisbursementStatus
} from '../controllers/disbursement.controller';
import { postVoucher } from '../controllers/accounting.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// Admin/Accountant routes
router.get('/admin/all', getAllRequisitionsAdmin);
router.patch('/:id/status', updateRequisitionStatus);

// Disbursement routes
router.get('/disbursements/history', getDisbursementHistory);
router.post('/:id/disburse', disburseRequisition);
router.post('/:id/acknowledge', acknowledgeReceipt);
router.patch('/disbursements/:id', updateDisbursement);
router.post('/disbursements/:id/analyze-proof', analyzeDisbursementProof);
router.get('/:id/verify-disbursement', verifyDisbursementStatus);

// Expense Tracking & Change Flow
router.put('/:id/expenses', updateRequisitionExpenses);
router.post('/:id/scan-receipts', scanReceipts);
router.post('/:id/items/:itemId/analyze-receipt', analyzeReceiptItem);
router.post('/:id/submit-change', submitChange);
router.post('/:id/confirm-change', confirmChange);
router.post('/:id/post-voucher', postVoucher);
router.post('/:id/approve-categorization', approveCategorization);
router.post('/:id/retrigger-ai', retriggerAICategorization);
router.post('/:id/post-quickbooks', postToQuickBooks);
router.delete('/:id/receipts/:receiptId', deleteReceipt);

// Message routes
router.get('/:id/messages', getRequisitionMessages);
router.post('/:id/messages', sendRequisitionMessage);
router.delete('/:id/messages/:messageId', deleteRequisitionMessage);

// Standard routes
router.post('/', createRequisition);
router.post('/:id/mark-read', markRequisitionRead);
router.get('/', getRequisitions);
router.get('/:id', getRequisitionById);
router.put('/:id', updateRequisition);

export default router;

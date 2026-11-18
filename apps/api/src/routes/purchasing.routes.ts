import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { assertEnterprise } from '../services/entitlements.service';
import * as c from '../controllers/purchasing.controller';
import * as qoc from '../controllers/quotesOrders.controller';

const router = Router();
router.use(requireAuth);
// Suppliers, purchase bills and stock history are Enterprise features.
router.use(async (req: any, res, next) => {
    try { await assertEnterprise(req.user.organization_id, 'Suppliers and purchasing'); next(); }
    catch (e: any) { res.status(402).json({ error: e.message, code: 'PLAN_LIMIT', upgrade: true }); }
});
const read = requireRole(['ACCOUNTANT', 'ADMIN', 'MANAGEMENT', 'AUTHORISER', 'CASHIER']);
const write = requireRole(['ACCOUNTANT', 'ADMIN']);

router.get('/suppliers', read, c.suppliers);
router.post('/suppliers', write, c.createSupplier);
router.get('/suppliers/:id', read, c.supplier);
router.put('/suppliers/:id', write, c.updateSupplier);
router.get('/orders', read, qoc.orders);
router.post('/orders', write, qoc.createOrder);
router.post('/orders/:id/receive', write, qoc.receiveOrder);
router.post('/orders/:id/cancel', write, qoc.cancelOrder);
router.get('/bills', read, c.bills);
router.post('/bills', write, c.createBill);
router.post('/bills/:id/pay', write, c.payBill);
router.post('/bills/:id/wallet-pay', write, c.walletPay);
router.post('/bills/:id/void', write, c.voidBill);
router.get('/stock/movements', read, c.movements);
router.post('/stock/adjust', write, c.adjustStock);
router.get('/stock/valuation', read, c.valuation);
router.get('/reports/payables-ageing', read, c.ageing);

export default router;

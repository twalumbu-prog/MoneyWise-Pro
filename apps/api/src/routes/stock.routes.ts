import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import * as c from '../controllers/purchasing.controller';

/** Everyday stock for any plan (no suppliers or bills needed): use stock, restock with a cost, what is low, what was spent. */
const router = Router();
router.use(requireAuth);
const read = requireRole(['ACCOUNTANT', 'ADMIN', 'MANAGEMENT', 'AUTHORISER', 'CASHIER']);
const write = requireRole(['ACCOUNTANT', 'ADMIN', 'AUTHORISER', 'CASHIER']);

router.get('/low', read, c.lowStock);
router.get('/spending', read, c.spending);
router.post('/use', write, c.useStock);
router.post('/restock', write, c.restock);
router.post('/loss', write, c.writeOff);
router.get('/losses', read, c.lossLog);

export default router;

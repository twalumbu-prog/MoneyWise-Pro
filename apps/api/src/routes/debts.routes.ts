import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import * as c from '../controllers/debts.controller';

/** Debt tracking: tag a transaction as a loan, advance or repayment, and see who you owe and who owes you. */
const router = Router();
router.use(requireAuth);
const read = requireRole(['ACCOUNTANT', 'ADMIN', 'MANAGEMENT', 'AUTHORISER', 'CASHIER', 'REQUESTOR']);
const write = requireRole(['ACCOUNTANT', 'ADMIN', 'CASHIER']);

router.get('/tags', read, c.tags);
router.get('/counterparties', read, c.counterparties);
router.post('/tag', write, c.tagEntry);
router.delete('/tag/:entryId', write, c.untagEntry);
router.post('/opening', write, c.recordOpening);
router.delete('/opening/:id', write, c.removeOpening);
router.get('/', read, c.overview);
router.get('/:id', read, c.detail);
router.patch('/:id', write, c.update);

export default router;

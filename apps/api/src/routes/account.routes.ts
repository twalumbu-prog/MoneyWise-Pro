import { Router } from 'express';
import { getAccounts, createAccount, updateAccount, suggestAccount, runAccountsMigration } from '../controllers/account.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', getAccounts);
router.post('/', createAccount);
router.post('/suggest', suggestAccount);
router.put('/:id', updateAccount);

export default router;

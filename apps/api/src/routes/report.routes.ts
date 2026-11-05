import { Router } from 'express';
import { getExpenditure, getExpenditureItems } from '../controllers/report.controller';
import { getTrialBalance, getCashFlow, getChangesInEquity, getGeneralLedger } from '../controllers/journal.controller';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/expenditure', requireRole(['AUTHORISER', 'ACCOUNTANT', 'ADMIN', 'MANAGEMENT']), getExpenditure);
router.get('/expenditure/:accountId/items', requireRole(['AUTHORISER', 'ACCOUNTANT', 'ADMIN', 'MANAGEMENT']), getExpenditureItems);

const STATEMENT_ROLES = ['AUTHORISER', 'ACCOUNTANT', 'ADMIN', 'MANAGEMENT'];
router.get('/trial-balance', requireRole(STATEMENT_ROLES), getTrialBalance);
router.get('/cash-flow', requireRole(STATEMENT_ROLES), getCashFlow);
router.get('/changes-in-equity', requireRole(STATEMENT_ROLES), getChangesInEquity);
router.get('/general-ledger', requireRole(STATEMENT_ROLES), getGeneralLedger);

export default router;

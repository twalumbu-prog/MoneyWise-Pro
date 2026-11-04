import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { assertEnterprise } from '../services/entitlements.service';
import * as ctl from '../controllers/accountingControls.controller';
import * as rpt from '../controllers/accountingReports.controller';
import { access, accounts, trialBalance, profitLoss, balanceSheet, generalLedger, runImport, batches, undo } from '../controllers/accountingStatements.controller';

const router = Router();
router.use(requireAuth);
router.get('/access', access);

// Everything below is an Enterprise feature.
router.use(async (req: any, res, next) => {
    try { await assertEnterprise(req.user.organization_id, 'Accounting'); next(); }
    catch (e: any) { res.status(402).json({ error: e.message, code: 'PLAN_LIMIT', upgrade: true }); }
});
const read = requireRole(['ACCOUNTANT', 'ADMIN', 'MANAGEMENT', 'AUTHORISER']);
const write = requireRole(['ACCOUNTANT', 'ADMIN']);
router.get('/accounts', read, accounts);
router.get('/trial-balance', read, trialBalance);
router.get('/profit-loss', read, profitLoss);
router.get('/balance-sheet', read, balanceSheet);
router.get('/general-ledger', read, generalLedger);
router.get('/lock', read, ctl.getLock);
router.put('/lock', write, ctl.setLock);
router.get('/journals', read, ctl.journals);
router.post('/journals', write, ctl.createJournal);
router.post('/journals/:id/reverse', write, ctl.reverseJournal);
router.get('/cash-flow', read, ctl.cashFlow);
router.get('/budget-vs-actual', read, rpt.budget);
router.get('/compare', read, rpt.compare);
router.get('/changes', read, rpt.changes);
router.get('/pdf', read, rpt.pdf);
router.get('/receivables-ageing', read, ctl.receivables);
router.post('/import', write, runImport);
router.get('/import/batches', write, batches);
router.delete('/import/:batch', write, undo);

export default router;

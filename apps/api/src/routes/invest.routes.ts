import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
    listInvestmentTargets, walletTransferToInvestmentTarget, recordInvestmentIntent, confirmInvestment,
    listMyInvestorAccounts, connectInvestorAccount, applyForInvestorAccount, extractInvestorId,
    listInvestorApplications, getInvestorApplication, reviewInvestorApplication,
    getPayoutSettings, savePayoutSettings,
} from '../controllers/invest.controller';

const router = Router();

router.use(requireAuth);

router.get('/targets', listInvestmentTargets);
router.post('/wallet-transfer', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), walletTransferToInvestmentTarget);
router.post('/intents', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), recordInvestmentIntent);
router.post('/confirm/:reference', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), confirmInvestment);

// Investor side: connect / register an account with a company.
router.get('/my-accounts', listMyInvestorAccounts);
router.post('/accounts/connect', connectInvestorAccount);
router.post('/accounts/apply', applyForInvestorAccount);
router.post('/accounts/extract-id', extractInvestorId);

// Company side: only an organization that IS an investment target has applications to show.
router.get('/applications', requireRole(['ACCOUNTANT', 'ADMIN']), listInvestorApplications);
router.get('/applications/:id', requireRole(['ACCOUNTANT', 'ADMIN']), getInvestorApplication);
router.patch('/applications/:id', requireRole(['ACCOUNTANT', 'ADMIN']), reviewInvestorApplication);
router.get('/payout-settings', requireRole(['ACCOUNTANT', 'ADMIN']), getPayoutSettings);
router.put('/payout-settings', requireRole(['ADMIN']), savePayoutSettings);

export default router;

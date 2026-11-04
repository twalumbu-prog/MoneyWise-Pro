import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
    listInvestmentTargets, walletTransferToInvestmentTarget, recordInvestmentIntent, confirmInvestment,
    listMyInvestorAccounts, connectInvestorAccount, applyForInvestorAccount, extractInvestorId,
    listInvestorApplications, getInvestorApplication, reviewInvestorApplication,
    getPayoutSettings, savePayoutSettings, applyWithKycProfile, getMyKycProfile, saveMyKycProfile,
    getMyPortfolio, setHoldingValue, listFunds, fundSeries, myFunds, saveFund, addFundPrices, deleteFundPrice, checkKycDocument, faceMatchStatusHandler, startFaceMatchHandler,
} from '../controllers/invest.controller';

const router = Router();

router.use(requireAuth);

router.get('/targets', listInvestmentTargets);
router.post('/wallet-transfer', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), walletTransferToInvestmentTarget);
router.post('/intents', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), recordInvestmentIntent);
router.post('/confirm/:reference', requireRole(['CASHIER', 'ACCOUNTANT', 'ADMIN']), confirmInvestment);

// Investor side: connect / register an account with a company.
router.get('/my-accounts', listMyInvestorAccounts);
router.get('/portfolio', getMyPortfolio);

// Real fund prices: everyone reads them; only the investment company itself (an ADMIN or ACCOUNTANT) lists funds and sends prices.
router.get('/funds', listFunds);
router.get('/funds/mine', requireRole(['ACCOUNTANT', 'ADMIN']), myFunds);
router.post('/funds', requireRole(['ACCOUNTANT', 'ADMIN']), saveFund);
router.post('/funds/:id/prices', requireRole(['ACCOUNTANT', 'ADMIN']), addFundPrices);
router.delete('/funds/:id/prices/:date', requireRole(['ACCOUNTANT', 'ADMIN']), deleteFundPrice);
router.get('/funds/:id/series', fundSeries);
router.put('/portfolio/:targetId/value', requireRole(['ADMIN', 'ACCOUNTANT']), setHoldingValue);
router.post('/accounts/connect', connectInvestorAccount);
router.post('/accounts/apply', applyForInvestorAccount);
router.post('/accounts/extract-id', extractInvestorId);
router.post('/accounts/apply-with-kyc', applyWithKycProfile);
router.get('/kyc-profile', getMyKycProfile);
router.put('/kyc-profile', saveMyKycProfile);
router.post('/kyc-profile/check-document', checkKycDocument);
router.get('/kyc-profile/face-match', faceMatchStatusHandler);
router.post('/kyc-profile/face-match', startFaceMatchHandler);

// Company side: only an organization that IS an investment target has applications to show.
router.get('/applications', requireRole(['ACCOUNTANT', 'ADMIN']), listInvestorApplications);
router.get('/applications/:id', requireRole(['ACCOUNTANT', 'ADMIN']), getInvestorApplication);
router.patch('/applications/:id', requireRole(['ACCOUNTANT', 'ADMIN']), reviewInvestorApplication);
router.get('/payout-settings', requireRole(['ACCOUNTANT', 'ADMIN']), getPayoutSettings);
router.put('/payout-settings', requireRole(['ADMIN']), savePayoutSettings);

export default router;

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import { getTerms, redeem, createOffer, myOffers, withdrawOffer, adminOffers, adminDecide, adminInvites, adminCreateInvite, adminRevokeInvite, adminLegal } from '../controllers/shareRound.controller';
import {
    listInvestmentTargets, walletTransferToInvestmentTarget, recordInvestmentIntent, confirmInvestment,
    listMyInvestorAccounts, connectInvestorAccount, applyForInvestorAccount, extractInvestorId,
    listInvestorApplications, getInvestorApplication, reviewInvestorApplication,
    getPayoutSettings, savePayoutSettings, applyWithKycProfile, getMyKycProfile, saveMyKycProfile,
    getMyPortfolio, setHoldingValue, getPortalView, postPortalTotals, postPortalOrderBook, listFunds, fundSeries, myFunds, saveFund, addFundPrices, deleteFundPrice, checkKycDocument, faceMatchStatusHandler, startFaceMatchHandler,
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

// Blue Opus share offers: a private, personal agreement (the company is not publicly listed). The admin routes are for Blue Opus itself.
router.get('/blue-opus', getTerms);
router.post('/blue-opus/redeem', redeem);
router.post('/blue-opus/offers', createOffer);
router.get('/blue-opus/offers/mine', myOffers);
router.post('/blue-opus/offers/:id/withdraw', withdrawOffer);
router.get('/blue-opus/admin/offers', requireSuperAdmin, adminOffers);
router.post('/blue-opus/admin/offers/:id', requireSuperAdmin, adminDecide);
router.get('/blue-opus/admin/invites', requireSuperAdmin, adminInvites);
router.post('/blue-opus/admin/invites', requireSuperAdmin, adminCreateInvite);
router.post('/blue-opus/admin/invites/:id/revoke', requireSuperAdmin, adminRevokeInvite);
router.post('/blue-opus/admin/legal', requireSuperAdmin, adminLegal);
router.get('/portfolio/portal', getPortalView);
router.post('/portfolio/portal/totals', requireRole(['ADMIN', 'ACCOUNTANT']), postPortalTotals);
router.post('/portfolio/portal/order-book', requireRole(['ADMIN', 'ACCOUNTANT']), postPortalOrderBook);
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

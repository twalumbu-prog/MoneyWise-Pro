import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
    getOnboardingState,
    saveProgress,
    updateOrganizationName,
    saveBusinessProfile,
    generateChartOfAccounts,
    saveChartOfAccounts,
    getWalletStatus,
    claimWallet,
    confirmWalletActivation,
    completeOnboarding,
} from '../controllers/onboarding.controller';
import { getWalkthroughProgress } from '../controllers/walkthrough.controller';
import {
    getPersonalMoney, savePersonalAccount, deletePersonalAccount, savePersonalHolding, deletePersonalHolding, getGmailFindings,
    attachGmailStatementToKyc, checkPersonalWalletActivation,
} from '../controllers/personalMoney.controller';
import {
    getPersonalOnboardingState, savePersonalOnboardingStep, completePersonalOnboarding, sendPhoneCode, verifyPhoneCode, saveAvatar,
} from '../controllers/personalOnboarding.controller';

const router = Router();

router.use(requireAuth);

router.get('/state', getOnboardingState);
router.get('/walkthrough', getWalkthroughProgress);
router.put('/progress', saveProgress);
router.put('/organization', updateOrganizationName);
router.put('/profile', saveBusinessProfile);

router.post('/chart-of-accounts/generate', generateChartOfAccounts);
router.post('/chart-of-accounts', saveChartOfAccounts);

router.get('/wallet', getWalletStatus);
router.post('/wallet/claim', claimWallet);
router.post('/wallet/activation-confirm', confirmWalletActivation);

router.post('/complete', completeOnboarding);

// MoneyWise Personal onboarding (flow PERSONAL_V2)
router.get('/personal/state', getPersonalOnboardingState);
router.put('/personal/steps/:key', savePersonalOnboardingStep);
router.post('/personal/complete', completePersonalOnboarding);
router.post('/personal/phone/send', sendPhoneCode);
router.post('/personal/phone/verify', verifyPhoneCode);
router.post('/personal/avatar', saveAvatar);
router.get('/personal/money', getPersonalMoney);
router.put('/personal/accounts', savePersonalAccount);
router.delete('/personal/accounts/:walletId', deletePersonalAccount);
router.put('/personal/holdings', savePersonalHolding);
router.delete('/personal/holdings/:accountId', deletePersonalHolding);
router.get('/personal/gmail-findings', getGmailFindings);
router.post('/personal/kyc/statement-from-gmail', attachGmailStatementToKyc);
router.post('/personal/wallet/check', checkPersonalWalletActivation);

export default router;

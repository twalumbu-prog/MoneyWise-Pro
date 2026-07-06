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

const router = Router();

router.use(requireAuth);

router.get('/state', getOnboardingState);
router.put('/progress', saveProgress);
router.put('/organization', updateOrganizationName);
router.put('/profile', saveBusinessProfile);

router.post('/chart-of-accounts/generate', generateChartOfAccounts);
router.post('/chart-of-accounts', saveChartOfAccounts);

router.get('/wallet', getWalletStatus);
router.post('/wallet/claim', claimWallet);
router.post('/wallet/activation-confirm', confirmWalletActivation);

router.post('/complete', completeOnboarding);

export default router;

import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { 
    getUsers, getNotificationsSummary, createUser, updateUser, deleteUser, 
    resendInvite, getMyProfile, updatePaymentInfo, registerPushToken, 
    unregisterPushToken, searchRecipients, verifyRecipient,
    getMyPreferences, updateMyPreferences, getMyEmployers, requestPinRecovery, verifyPinRecovery 
} from '../controllers/user.controller';

const router = Router();

router.use(requireAuth);

router.get('/notifications', getNotificationsSummary);
router.get('/me', getMyProfile);
router.put('/me/payment-info', updatePaymentInfo);
router.get('/me/preferences', getMyPreferences);
router.get('/me/employers', getMyEmployers);
router.put('/me/preferences', updateMyPreferences);
router.post('/me/pin-recovery/request', requestPinRecovery);
router.post('/me/pin-recovery/verify', verifyPinRecovery);
router.post('/me/push-token', registerPushToken);
router.delete('/me/push-token', unregisterPushToken);
router.get('/search-recipients', searchRecipients);
router.post('/verify-recipient', verifyRecipient);
router.get('/', getUsers);
router.post('/', createUser); // Admin only check inside controller
router.put('/:id', updateUser); // Admin only check inside controller
router.delete('/:id', deleteUser); // Admin only check inside controller
router.post('/:id/resend-invite', resendInvite); // Admin only check inside controller

export default router;

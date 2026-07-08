import { Router } from 'express';
import { 
    registerUser, 
    simpleSignup, 
    resolveUsername,
    forgotPassword,
    completeInvitation,
    searchOrganizations, 
    joinRequest,
    getMyOrganizations,
    switchOrganization
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/register', registerUser);
router.post('/signup', simpleSignup);
router.post('/resolve-username', resolveUsername);
router.post('/forgot-password', forgotPassword);

// New join request flow endpoints
router.get('/organizations/search', searchOrganizations);
router.post('/join-request', joinRequest);

// Protected routes
router.post('/complete-invitation', requireAuth, completeInvitation);
router.get('/my-organizations', requireAuth, getMyOrganizations);
router.post('/switch-organization', requireAuth, switchOrganization);

export default router;


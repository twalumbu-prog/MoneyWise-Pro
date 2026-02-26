import { Router } from 'express';
import { registerUser, simpleSignup, resolveUsername, completeInvitation, searchOrganizations, joinRequest } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/register', registerUser);
router.post('/signup', simpleSignup);
router.post('/resolve-username', resolveUsername);

// New join request flow endpoints
router.get('/organizations/search', searchOrganizations);
router.post('/join-request', joinRequest);

// Protected routes
router.post('/complete-invitation', requireAuth, completeInvitation);

export default router;

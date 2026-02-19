import { Router } from 'express';
import { registerUser, simpleSignup, resolveUsername, completeInvitation } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/register', registerUser);
router.post('/signup', simpleSignup);
router.post('/resolve-username', resolveUsername);

// Protected routes
router.post('/complete-invitation', requireAuth, completeInvitation);

export default router;

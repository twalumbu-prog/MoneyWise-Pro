import { Router } from 'express';
import { registerUser, simpleSignup, resolveUsername } from '../controllers/auth.controller';

const router = Router();

router.post('/register', registerUser);
router.post('/signup', simpleSignup);
router.post('/resolve-username', resolveUsername);

export default router;

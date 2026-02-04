import { Router } from 'express';
import { registerUser, simpleSignup } from '../controllers/auth.controller';

const router = Router();

router.post('/register', registerUser);
router.post('/signup', simpleSignup);

export default router;

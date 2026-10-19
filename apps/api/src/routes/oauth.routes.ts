import express, { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { authorizeInfo, authorizeDecision, token, revoke } from '../controllers/oauth.controller';

const router = Router();
const form = express.urlencoded({ extended: false });

// Consent screen (called by the MoneyWise web app on behalf of the signed-in admin)
router.get('/authorize/info', requireAuth, authorizeInfo);
router.post('/authorize', requireAuth, authorizeDecision);

// Called by the connecting app (form-encoded per RFC 6749, JSON also accepted)
router.post('/token', form, token);
router.post('/revoke', form, revoke);

export default router;

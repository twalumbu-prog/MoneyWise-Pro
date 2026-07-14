import { Router } from 'express';
import { ingestVercelLogDrain } from '../controllers/vercelLogDrain.controller';

const router = Router();

// Vercel probes this URL before activating a drain and expects this header
// back verbatim (deterministic per team/endpoint, not a rotating secret) to
// confirm we control the endpoint. See docs/rest-api/drains — no request body
// is required for this check, so it's applied ahead of the real POST handler.
router.use('/vercel-log-drain', (req, res, next) => {
    if (process.env.VERCEL_LOG_DRAIN_VERIFY) {
        res.setHeader('x-vercel-verify', process.env.VERCEL_LOG_DRAIN_VERIFY);
    }
    next();
});

router.get('/vercel-log-drain', (_req, res) => res.status(200).json({ ok: true }));
router.post('/vercel-log-drain', ingestVercelLogDrain);

export default router;

import { Router } from 'express';
import { ingestVercelLogDrain } from '../controllers/vercelLogDrain.controller';
import { webhook as lipilaWebhook } from '../controllers/lipila.controller';
import { callbackSecretOk } from '../services/mtn.service';
import { handleCallback as handleMtnCallback } from '../services/mtnPayout.service';

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

// Lipila card payments. The body stays raw (the signature covers its exact bytes).
router.post('/lipila', lipilaWebhook);

// MTN MoMo (developers.mtn.com). MTN's callbacks don't carry a signature, so the address itself is the secret:
//   /webhooks/mtn/<MTN_CALLBACK_SECRET>            or   /webhooks/mtn/<MTN_CALLBACK_SECRET>/<product>   (payments, withdrawals, ussd…)
// A wrong or missing secret gets a 404 like any unknown page. For now a valid callback is only acknowledged and logged (trimmed, no
// headers) so the real payloads can be seen before any handling is written. Nothing here moves money or changes data.
router.all(['/mtn/:secret', '/mtn/:secret/:product'], (req, res) => {
    if (!callbackSecretOk(req.params.secret)) return res.status(404).end();
    if (req.method === 'POST' || req.method === 'PUT') {
        try {
            const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {});
            console.log(`[MTN callback${req.params.product ? `:${req.params.product}` : ''}]`, body.slice(0, 4000));
        } catch { /* never fail the acknowledgement */ }
        // A payments callback only points at a payout; the payout is then re-checked with MTN (never trusted from the callback).
        if (req.params.product === 'payments') {
            try { const parsed = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {})); void handleMtnCallback(parsed).catch((e) => console.error('[MTN callback] handling failed:', e?.message ?? e)); } catch { /* not JSON */ }
        }
    }
    res.status(200).json({ statusCode: '0000', statusMessage: 'received' });
});

export default router;

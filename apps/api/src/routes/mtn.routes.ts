import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import * as payouts from '../services/mtnPayout.service';
import * as products from '../services/mtnProducts.service';
import { MtnError, mtnGatewayStatus, validateAccountHolder } from '../services/mtn.service';

const router = Router();
router.use(requireAuth, requireSuperAdmin);

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof payouts.PayoutError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error(`[MTN payout] ${what}:`, e?.message ?? e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};

// What is still missing before payouts can run (names only, never values)
router.get('/payouts/setup', async (_req, res) => { try { res.json(await payouts.payoutSettings()); } catch (e) { fail(res, e, 'check the setup'); } });
router.get('/payouts', async (_req, res) => {
    try { await payouts.processCallbacks().catch(() => undefined); res.json({ payouts: await payouts.listPayouts() }); } catch (e) { fail(res, e, 'load the payouts'); }
});
router.post('/payouts', async (req: any, res) => {
    try { res.status(201).json({ payout: await payouts.createPayout({ adminId: String(req.user?.id), phone: req.body?.phone, amount: Number(req.body?.amount), note: req.body?.note, idempotencyKey: req.body?.idempotencyKey }) }); }
    catch (e) { fail(res, e, 'make the payout'); }
});
// ---- Everything else MTN offers (super admins) ----
const wrap = (what: string, fn: (req: any) => Promise<unknown>, status = 200) => async (req: any, res: Response) => {
    try { res.status(status).json(await fn(req)); }
    catch (e: any) {
        if (e instanceof payouts.PayoutError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
        if (e instanceof MtnError) return res.status(e.httpStatus >= 400 && e.httpStatus < 600 ? e.httpStatus : 502).json({ error: e.message, statusCode: e.statusCode, missing: e.missing });
        console.error(`[MTN] ${what}:`, e?.message ?? e); res.status(500).json({ error: `Could not ${what}. Please try again.` });
    }
};
const admin = (req: any) => String(req.user?.id);

router.get('/status', wrap('check MTN', (req) => mtnGatewayStatus({ signIn: req.query.signin === '1' })));
router.get('/account/:phone', wrap('look up the account', async (req) => ({ valid: (await validateAccountHolder(req.params.phone)).isValid, info: req.query.full === '1' ? await products.accountInfo(req.params.phone) : undefined })));
router.get('/catalogue', wrap('load the catalogue', (req) => products.catalogue({ siteId: String(req.query.siteId ?? ''), senderId: String(req.query.senderId ?? ''), topOffers: req.query.top === '1' })));
router.get('/customers/:phone/plans', wrap('load the plans', (req) => products.customerPlans(req.params.phone)));
router.get('/customers/:phone/subscriptions', wrap('load the subscriptions', (req) => products.customerSubscriptions(req.params.phone)));
router.get('/operations', wrap('load the operations', async () => ({ operations: await products.listOperations() })));
router.post('/airtime', wrap('buy the airtime', async (req) => ({ operation: await products.buyAirtime({ adminId: admin(req), phone: req.body?.phone, amount: Number(req.body?.amount), idempotencyKey: req.body?.idempotencyKey }) }), 201));
router.post('/bundles', wrap('buy the bundle', async (req) => ({ operation: await products.buyBundle({ adminId: admin(req), phone: req.body?.phone, productId: req.body?.productId, idempotencyKey: req.body?.idempotencyKey }) }), 201));
router.post('/subscriptions', wrap('subscribe', async (req) => ({ operation: await products.subscribe({ adminId: admin(req), phone: req.body?.phone, subscriptionId: req.body?.subscriptionId, providerId: req.body?.providerId, name: req.body?.name, idempotencyKey: req.body?.idempotencyKey }) }), 201));
router.post('/withdrawals', wrap('start the withdrawal', async (req) => ({ operation: await products.withdrawAtAgent({ adminId: admin(req), phone: req.body?.phone, agentCode: req.body?.agentCode, amount: Number(req.body?.amount), idempotencyKey: req.body?.idempotencyKey }) }), 201));
router.post('/notifications/register-withdrawals', wrap('register the callback', () => products.registerWithdrawalCallback()));
router.post('/ussd/subscribe', wrap('subscribe the USSD code', (req) => products.ussdSubscribe(req.body?.serviceCode)));
router.delete('/ussd/subscription/:id', wrap('remove the USSD subscription', (req) => products.ussdUnsubscribe(req.params.id)));
router.post('/ussd/push', wrap('send the USSD message', (req) => products.ussdPush({ msisdn: req.body?.msisdn, serviceCode: req.body?.serviceCode, text: String(req.body?.text ?? ''), sessionId: req.body?.sessionId, messageType: req.body?.messageType })));

router.post('/payouts/:id/refresh', async (req, res) => { try { res.json({ payout: await payouts.refreshPayout(req.params.id) }); } catch (e) { fail(res, e, 'check the payout'); } });

export default router;

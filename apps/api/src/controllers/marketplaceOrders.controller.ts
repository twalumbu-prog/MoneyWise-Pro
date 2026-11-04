import { Response } from 'express';
import { supabase } from '../lib/supabase';
import { settleAll } from '../services/marketplace.service';
import { PayLaterError, myPlans, offerFor, payInstalment, sweepPayLater } from '../services/payLater.service';
import {
    Ctx, OrderError, createOrder, listOrders, openDispute, quoteOrder, refundOrder, refreshOrder, resolveDispute, respondToDispute, setOrderStatus,
} from '../services/marketplaceOrders.service';

async function ctxOf(req: any): Promise<Ctx> {
    const { data } = await supabase.from('users').select('name').eq('id', req.user.id).maybeSingle();
    return { userId: req.user.id, orgId: req.user.organization_id, role: req.user.role, name: data?.name || req.user.email || 'MoneyWise user' };
}

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof OrderError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error(`[Marketplace] ${what}:`, e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};

/** POST /marketplace/checkout/quote  What an order costs, the delivery choices and the buyer's wallets. Charges nothing. */
export const quote = async (req: any, res: Response) => {
    try {
        const b = req.body ?? {};
        res.json(await quoteOrder(await ctxOf(req), { productId: b.productId, checkIn: b.checkIn, checkOut: b.checkOut, variantId: b.variantId, quantity: b.quantity, area: b.area, size: b.size, weightKg: b.weightKg, speed: b.speed, auctionId: b.auctionId }));
    } catch (e) { fail(res, e, 'work out the price'); }
};

/** POST /marketplace/orders  Pays for an item from the buyer's wallet (MoneyWise Pay, no fee) and records the order. */
export const placeOrder = async (req: any, res: Response) => {
    try {
        const b = req.body ?? {};
        const result = await createOrder(await ctxOf(req), {
            productId: b.productId, checkIn: b.checkIn, checkOut: b.checkOut, variantId: b.variantId, quantity: b.quantity, area: b.area, size: b.size, weightKg: b.weightKg, speed: b.speed, auctionId: b.auctionId, deliveryMethod: b.deliveryMethod,
            address: b.address, notes: b.notes, phone: b.phone, walletId: b.walletId, idempotencyKey: b.idempotencyKey, payLater: !!b.payLater,
        });
        res.status(result.repeated ? 200 : 201).json(result);
    } catch (e) { fail(res, e, 'complete the order'); }
};

/** GET /marketplace/orders?role=buyer|seller */
export const myOrders = async (req: any, res: Response) => {
    try {
        const role = req.query.role === 'seller' ? 'seller' : 'buyer';
        res.json({ orders: await listOrders(await ctxOf(req), role) });
    } catch (e) { fail(res, e, 'load your orders'); }
};

/** GET /marketplace/orders/:id */
export const getOrder = async (req: any, res: Response) => {
    try {
        const ctx = await ctxOf(req);
        const { data: o } = await supabase.from('marketplace_orders').select('*').eq('id', req.params.id).maybeSingle();
        if (!o || (o.buyer_user_id !== ctx.userId && o.seller_org_id !== ctx.orgId)) return res.status(404).json({ error: 'Order not found' });
        res.json({ order: await refreshOrder(o) });
    } catch (e) { fail(res, e, 'load the order'); }
};

/** POST /marketplace/orders/:id/status  { status } */
export const updateStatus = async (req: any, res: Response) => {
    try { res.json({ order: await setOrderStatus(await ctxOf(req), req.params.id, String(req.body?.status ?? '')) }); }
    catch (e) { fail(res, e, 'update the order'); }
};

/** POST /marketplace/orders/:id/dispute  { reason } */
export const dispute = async (req: any, res: Response) => {
    try { res.json({ order: await openDispute(await ctxOf(req), req.params.id, req.body?.reason) }); }
    catch (e) { fail(res, e, 'report the problem'); }
};

/** POST /marketplace/orders/:id/dispute/respond  { note } */
export const disputeRespond = async (req: any, res: Response) => {
    try { res.json({ order: await respondToDispute(await ctxOf(req), req.params.id, req.body?.note) }); }
    catch (e) { fail(res, e, 'send your response'); }
};

/** POST /marketplace/orders/:id/dispute/resolve */
export const disputeResolve = async (req: any, res: Response) => {
    try { res.json({ order: await resolveDispute(await ctxOf(req), req.params.id) }); }
    catch (e) { fail(res, e, 'close the problem'); }
};

/** POST /marketplace/orders/:id/refund  { walletId? }  The seller sends the buyer's money back from their own wallet. */
export const refund = async (req: any, res: Response) => {
    try { res.json({ order: await refundOrder(await ctxOf(req), req.params.id, req.body?.walletId) }); }
    catch (e) { fail(res, e, 'send the refund'); }
};

/** GET /marketplace/pay-later  The buyer's Pay in 4 eligibility and limit, and their plans. */
export const payLaterOverview = async (req: any, res: Response) => {
    try {
        const [offer, plans] = await Promise.all([offerFor(req.user.id, req.user.organization_id), myPlans(req.user.id)]);
        res.json({ offer, plans });
    } catch (e) { fail(res, e, 'load Pay in 4'); }
};

/** POST /marketplace/pay-later/instalments/:id/pay  { walletId? } */
export const payLaterPay = async (req: any, res: Response) => {
    try { res.json(await payInstalment(req.params.id, { userId: req.user.id }, req.body?.walletId)); }
    catch (e: any) {
        if (e instanceof PayLaterError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
        fail(res, e, 'take the payment');
    }
};

/**
 * POST /marketplace/settleCalled by the scheduler every minute (Bearer LENCO_SYNC_SECRET, like the other cron routes): closes ended
 * auctions, reminds winners who haven't paid, and marks wins that weren't paid in time.
 */
export const settle = async (req: any, res: Response) => {
    const secret = process.env.LENCO_SYNC_SECRET;
    if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
    try { res.json({ ok: true, ...(await settleAll()), payLater: await sweepPayLater() }); }
    catch (e: any) { console.error('[Marketplace] settle error:', e); res.status(500).json({ error: e?.message ?? 'settle failed' }); }
};

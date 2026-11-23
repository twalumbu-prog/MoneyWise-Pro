import { Request, Response } from 'express';
import { rewardsService, RewardsError, PLATFORM } from '../services/rewards.service';

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof RewardsError) return res.status(e.httpStatus).json({ error: e.message });
    console.error(`[Rewards] ${what}:`, e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};
const me = (req: Request) => (req as any).user as { id: string; organization_id: string; role: string };

/** Every programme the person is in: MoneyWise first, then each business, with points and progress. */
export const getOverview = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.getOverview(me(req).id)); } catch (e) { fail(res, e, 'load your rewards'); }
};

/** One programme ("moneywise" or a business id): the points history and the achievements. */
export const getDetail = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.getDetail(me(req).id, String(req.params.scope))); } catch (e) { fail(res, e, 'load these rewards'); }
};

export const getInvite = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.getInvite(me(req).id, String(req.params.scope || PLATFORM))); } catch (e) { fail(res, e, 'create your invite'); }
};

export const claimReferral = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.claimReferral(me(req).id, String(req.body?.code ?? ''))); } catch (e) { fail(res, e, 'add that code'); }
};

export const getRedeemables = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.getRedeemables(me(req).id)); } catch (e) { fail(res, e, 'load your rewards'); }
};

export const redeem = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.redeem(me(req).id, String(req.params.scope), req.body?.rewardId ? String(req.body.rewardId) : undefined)); } catch (e) { fail(res, e, 'redeem'); }
};

/** The business's own programme settings (any member can read; only an admin changes them). */
export const getProgram = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.getProgram(me(req).organization_id)); } catch (e) { fail(res, e, 'load the programme'); }
};
export const updateProgram = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.updateProgram(me(req).organization_id, req.body ?? {})); } catch (e) { fail(res, e, 'save the programme'); }
};

/** A customer shows their voucher code; the business marks it used. */
export const useVoucher = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.useVoucher(me(req).organization_id, me(req).id, String(req.body?.code ?? ''))); } catch (e) { fail(res, e, 'use that reward'); }
};

/** Staff look at a voucher before using it: what it is worth, what it covers, whose it is, and (given the order's lines) how much it takes off. */
export const checkVoucher = async (req: Request, res: Response) => {
    try {
        const lines = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 100).map((i: any) => ({ product_id: String(i?.product_id ?? ''), unit_price: Number(i?.unit_price), quantity: Number(i?.quantity) }));
        res.json(await rewardsService.checkVoucher(me(req).organization_id, String(req.body?.code ?? ''), lines));
    } catch (e) { fail(res, e, 'check that reward'); }
};

/** The business's own list of rewards (any member can read; only an admin changes them). */
export const listRewardItems = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.listRewardItems(me(req).organization_id)); } catch (e) { fail(res, e, 'load the rewards'); }
};
export const createRewardItem = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.createRewardItem(me(req).organization_id, req.body ?? {})); } catch (e) { fail(res, e, 'add the reward'); }
};
export const updateRewardItem = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.updateRewardItem(me(req).organization_id, String(req.params.id), req.body ?? {})); } catch (e) { fail(res, e, 'save the reward'); }
};
export const deleteRewardItem = async (req: Request, res: Response) => {
    try { await rewardsService.deleteRewardItem(me(req).organization_id, String(req.params.id)); res.json({ ok: true }); } catch (e) { fail(res, e, 'delete the reward'); }
};

/** Public (no sign-in): what a store purchase earns, for the checkout success screen. */
export const previewPurchase = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.previewPurchase(String(req.query.reference ?? ''), String(req.query.organizationId ?? ''))); } catch (e) { fail(res, e, 'load the rewards for this purchase'); }
};

/**
 * Public (no sign-in): the store checks a voucher code against the customer's order and says what it takes off. A code is a bearer token (whoever
 * holds it holds the reward), so guessing is limited: 12 wrong tries in 10 minutes from one address, then a pause. Holds nothing.
 */
const guesses = new Map<string, { n: number; since: number }>();
const WINDOW_MS = 10 * 60_000, MAX_WRONG = 12;
export const previewVoucherForCart = async (req: Request, res: Response) => {
    const ip = String((req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || 'unknown').trim();
    const now = Date.now();
    const g = guesses.get(ip);
    if (g && now - g.since < WINDOW_MS && g.n >= MAX_WRONG) return res.status(429).json({ error: 'Too many tries. Please wait a few minutes and try again.' });
    try {
        const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 100).map((i: any) => ({ id: String(i?.id ?? ''), quantity: Number(i?.quantity) }));
        res.json(await rewardsService.previewVoucherForCart(String(req.body?.organizationId ?? ''), String(req.body?.code ?? ''), items));
    } catch (e: any) {
        // Only a code that is not a real, usable reward counts as a wrong try (not "add something to your order first").
        if (e instanceof RewardsError && (e.httpStatus === 404 || e.httpStatus === 409)) {
            const cur = g && now - g.since < WINDOW_MS ? g : { n: 0, since: now };
            guesses.set(ip, { n: cur.n + 1, since: cur.since });
        }
        fail(res, e, 'check that reward');
    }
};

/** Adds a store purchase's points to the signed-in person's rewards. */
export const claimPurchase = async (req: Request, res: Response) => {
    try { res.json(await rewardsService.claimPurchase(me(req).id, String(req.body?.reference ?? ''), String(req.body?.organizationId ?? ''))); } catch (e) { fail(res, e, 'add these points'); }
};

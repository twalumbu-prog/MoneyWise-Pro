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
    try { res.json(await rewardsService.redeem(me(req).id, String(req.params.scope))); } catch (e) { fail(res, e, 'redeem'); }
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

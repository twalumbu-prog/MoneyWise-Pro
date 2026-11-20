import { Response } from 'express';
import * as shares from '../services/shareRound.service';
import { notifyUser } from '../services/marketplaceNotify';

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof shares.ShareError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error(`[Shares] ${what} failed:`, e?.message ?? e);
    return res.status(500).json({ error: `Couldn’t ${what}.` });
};

/** Platform super-admins (the same list the admin routes use): Blue Opus itself. */
const isSuper = (req: any): boolean => {
    if (req.user?.id === 'service-role-admin') return true;
    const email = String(req.user?.email || '').trim().toLowerCase();
    const allow = String(process.env.SUPER_ADMIN_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    return !!email && allow.includes(email);
};

/** GET /investments/blue-opus  The round's terms and the agreement, or, without an invitation, only { access: false }. */
export const getTerms = async (req: any, res: Response) => {
    try { res.json({ ...(await shares.terms(await shares.hasAccess(req.user.id, isSuper(req)))), isAdmin: isSuper(req) }); } catch (e) { fail(res, e, 'load the share terms'); }
};

/** POST /investments/blue-opus/redeem  { code }  Opens the offer for this account. */
export const redeem = async (req: any, res: Response) => { try { res.json(await shares.redeemInvite(req.user.id, req.body?.code)); } catch (e) { fail(res, e, 'check your code'); } };

/** POST /investments/blue-opus/offers  { amount, fullName, acceptedName, agree, declarations, email?, phone? } */
export const createOffer = async (req: any, res: Response) => {
    try {
        const ip = String(req.headers['x-forwarded-for'] ?? req.ip ?? '').split(',')[0].trim() || null;
        res.status(201).json({ offer: await shares.createOffer(req.user, req.body ?? {}, ip, isSuper(req)) });
    } catch (e) { fail(res, e, 'send your offer'); }
};

export const myOffers = async (req: any, res: Response) => { try { res.json({ offers: await shares.myOffers(req.user.id) }); } catch (e) { fail(res, e, 'load your offers'); } };
export const withdrawOffer = async (req: any, res: Response) => { try { res.json(await shares.withdraw(req.user.id, req.params.id)); } catch (e) { fail(res, e, 'withdraw the offer'); } };

/** Blue Opus (platform super-admins only) */
export const adminOffers = async (req: any, res: Response) => { try { res.json(await shares.adminList(typeof req.query.status === 'string' ? req.query.status : undefined)); } catch (e) { fail(res, e, 'load the offers'); } };
export const adminDecide = async (req: any, res: Response) => {
    try {
        const o = await shares.adminDecide(req.params.id, String(req.body?.status ?? ''), req.body?.note);
        const words: Record<string, string> = { COUNTERSIGNED: 'Blue Opus has accepted your offer. Check the note for how to pay.', PAID: 'Your payment is confirmed. You will be added to the share register.', DECLINED: 'Blue Opus could not accept this offer.' };
        if (words[o.status]) void notifyUser(o.user_id, { title: 'Your Blue Opus share offer', path: '/invest/blue-opus', body: `${words[o.status]}${o.note ? ` ${o.note}` : ''}` });
        res.json({ offer: o });
    } catch (e) { fail(res, e, 'update the offer'); }
};
export const adminInvites = async (_req: any, res: Response) => { try { res.json({ invites: await shares.adminListInvites() }); } catch (e) { fail(res, e, 'load the invitations'); } };
export const adminCreateInvite = async (req: any, res: Response) => { try { res.status(201).json({ invite: await shares.adminCreateInvite(req.user.id, req.body ?? {}) }); } catch (e) { fail(res, e, 'make the invitation'); } };
export const adminRevokeInvite = async (req: any, res: Response) => { try { res.json(await shares.adminRevokeInvite(req.params.id)); } catch (e) { fail(res, e, 'revoke the invitation'); } };
export const adminLegal = async (req: any, res: Response) => { try { res.json(await shares.adminSetLegalApproval(req.body?.approved === true, req.body?.reviewer)); } catch (e) { fail(res, e, 'record the legal approval'); } };

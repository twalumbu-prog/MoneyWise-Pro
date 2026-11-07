import { Response } from 'express';
import * as svc from '../services/advice.service';
import { PriceError } from '../services/priceCompare.service';

const fail = (res: Response, e: any, what: string) => {
    if (e instanceof PriceError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error(`[Advice] ${what}:`, e?.message ?? e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};

export const templates = async (_req: any, res: Response) => { try { res.json(await svc.templates()); } catch (e) { fail(res, e, 'load the example jobs'); } };
export const basket = async (req: any, res: Response) => { try { res.json(await svc.basket(req.body?.items, req.body?.town)); } catch (e) { fail(res, e, 'work out where to buy'); } };
export const business = async (req: any, res: Response) => { try { res.json({ business: await svc.businessPrices(req.params.id) }); } catch (e) { fail(res, e, 'load what businesses pay'); } };
export const getSharing = async (req: any, res: Response) => {
    try { res.json(req.user.organization_id ? await svc.getSharing(req.user.organization_id) : { sharing: false }); } catch (e) { fail(res, e, 'load the sharing setting'); }
};
export const setSharing = async (req: any, res: Response) => {
    try {
        if (!req.user.organization_id) return res.status(400).json({ error: 'No business on this account.' });
        if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Only the account holder can change this.' });
        res.json(await svc.setSharing(req.user.organization_id, req.body?.sharing === true));
    } catch (e) { fail(res, e, 'save the sharing setting'); }
};

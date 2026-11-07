import { Response } from 'express';
import { supabase } from '../lib/supabase';
import * as svc from '../services/rfq.service';

async function ctxOf(req: any): Promise<svc.Ctx> {
    const { data } = await supabase.from('users').select('name').eq('id', req.user.id).maybeSingle();
    return { userId: req.user.id, orgId: req.user.organization_id, role: req.user.role, name: data?.name || req.user.email || 'MoneyWise user' };
}
const fail = (res: Response, e: any, what: string) => {
    if (e instanceof svc.RfqError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error(`[RFQ] ${what}:`, e?.message ?? e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};

export const create = async (req: any, res: Response) => { try { res.status(201).json({ request: await svc.createRfq(await ctxOf(req), req.body ?? {}) }); } catch (e) { fail(res, e, 'send the request'); } };
export const mine = async (req: any, res: Response) => { try { res.json(await svc.myRequests(await ctxOf(req))); } catch (e) { fail(res, e, 'load your requests'); } };
export const board = async (req: any, res: Response) => { try { res.json(await svc.board(await ctxOf(req))); } catch (e) { fail(res, e, 'load the requests'); } };
export const one = async (req: any, res: Response) => { try { res.json(await svc.getRfq(await ctxOf(req), req.params.id)); } catch (e) { fail(res, e, 'load the request'); } };
export const quote = async (req: any, res: Response) => { try { res.json({ quote: await svc.submitQuote(await ctxOf(req), req.params.id, req.body ?? {}) }); } catch (e) { fail(res, e, 'send the quote'); } };
export const withdraw = async (req: any, res: Response) => { try { res.json(await svc.withdrawQuote(await ctxOf(req), req.params.id)); } catch (e) { fail(res, e, 'withdraw the quote'); } };
export const accept = async (req: any, res: Response) => { try { res.json(await svc.acceptQuote(await ctxOf(req), req.params.id)); } catch (e) { fail(res, e, 'accept the quote'); } };
export const cancel = async (req: any, res: Response) => { try { res.json(await svc.cancelRfq(await ctxOf(req), req.params.id)); } catch (e) { fail(res, e, 'cancel the request'); } };
export const adminOpen = async (_req: any, res: Response) => { try { res.json(await svc.adminOpen()); } catch (e) { fail(res, e, 'load the open requests'); } };
export const teamQuote = async (req: any, res: Response) => { try { res.json({ quote: await svc.teamAddQuote(req.params.id, req.body ?? {}, String(req.user?.id ?? 'admin')) }); } catch (e) { fail(res, e, 'save the quote'); } };

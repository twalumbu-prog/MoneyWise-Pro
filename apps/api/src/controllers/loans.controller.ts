import { Response } from 'express';
import { supabase } from '../lib/supabase';
import * as svc from '../services/loans.service';

async function ctxOf(req: any): Promise<svc.Ctx> {
    const { data } = await supabase.from('users').select('name').eq('id', req.user.id).maybeSingle();
    return { userId: req.user.id, orgId: req.user.organization_id, role: req.user.role, name: data?.name || req.user.email || 'MoneyWise user' };
}
const fail = (res: Response, e: any, what: string) => {
    if (e instanceof svc.LoanError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error(`[Loans] ${what}:`, e);
    return res.status(500).json({ error: `Could not ${what}. Please try again.` });
};

/** GET /loans  Lenders with their products, and what a borrower agrees to share. */
export const lenders = async (_req: any, res: Response) => { try { res.json(await svc.listLenders()); } catch (e) { fail(res, e, 'load the lenders'); } };
/** GET /loans/readiness?productId=  What this loan asks for, and how much is already on the person's MoneyWise ID. */
export const readiness = async (req: any, res: Response) => { try { res.json(await svc.readiness(await ctxOf(req), String(req.query.productId ?? ''))); } catch (e) { fail(res, e, 'check what you have ready'); } };
/** GET /loans/applications */
export const applications = async (req: any, res: Response) => { try { res.json({ applications: await svc.myApplications(req.user.organization_id) }); } catch (e) { fail(res, e, 'load your applications'); } };
/** POST /loans/applications */
export const apply = async (req: any, res: Response) => { try { res.status(201).json({ application: await svc.apply(await ctxOf(req), req.body ?? {}) }); } catch (e) { fail(res, e, 'send the application'); } };
/** POST /loans/applications/:id/withdraw */
export const withdraw = async (req: any, res: Response) => { try { res.json({ application: await svc.withdraw(await ctxOf(req), req.params.id) }); } catch (e) { fail(res, e, 'withdraw the application'); } };

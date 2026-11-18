import { Response } from 'express';
import { getEntitlements, PlanLimitError } from '../services/entitlements.service';
import * as acc from '../services/accounting.service';
import * as imp from '../services/accountingImport.service';

const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const fail = (res: Response, e: any, what: string) => {
    if (e instanceof PlanLimitError) return res.status(402).json({ error: e.message, code: 'PLAN_LIMIT', upgrade: true });
    console.error(`[Accounting] ${what}:`, e?.message ?? e);
    return res.status(500).json({ error: e?.message || `Could not ${what}.` });
};

/** GET /accounting/access  Whether this business has Accounting, so the page can show an upgrade prompt instead. Open to every plan. */
export const access = async (req: any, res: Response) => {
    try { const e = await getEntitlements(req.user.organization_id); res.json({ enabled: e.isEnterprise, planId: e.planId }); } catch (e) { fail(res, e, 'check your plan'); }
};
export const accounts = async (req: any, res: Response) => { try { res.json({ accounts: [...(await acc.loadAccounts(req.user.organization_id)).values()] }); } catch (e) { fail(res, e, 'load the accounts'); } };
export const trialBalance = async (req: any, res: Response) => { try { res.json(await acc.trialBalance(req.user.organization_id, date(req.query.asOf))); } catch (e) { fail(res, e, 'build the trial balance'); } };
export const profitLoss = async (req: any, res: Response) => { try { res.json(await acc.profitAndLoss(req.user.organization_id, date(req.query.from), date(req.query.to))); } catch (e) { fail(res, e, 'build the profit and loss'); } };
export const balanceSheet = async (req: any, res: Response) => { try { res.json(await acc.balanceSheet(req.user.organization_id, date(req.query.asOf))); } catch (e) { fail(res, e, 'build the balance sheet'); } };
export const generalLedger = async (req: any, res: Response) => { try { res.json(await acc.generalLedger(req.user.organization_id, String(req.query.accountId ?? ''), date(req.query.from), date(req.query.to))); } catch (e) { fail(res, e, 'load the account'); } };
export const runImport = async (req: any, res: Response) => { try { res.json(await imp.runImport(req.user.organization_id, req.user.id, req.body ?? {})); } catch (e) { fail(res, e, 'read that file'); } };
export const batches = async (req: any, res: Response) => { try { res.json({ batches: await imp.listBatches(req.user.organization_id) }); } catch (e) { fail(res, e, 'load past imports'); } };
export const undo = async (req: any, res: Response) => { try { res.json(await imp.undoBatch(req.user.organization_id, String(req.params.batch))); } catch (e) { fail(res, e, 'undo that import'); } };
